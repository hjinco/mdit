#!/usr/bin/env python3
"""Package macOS apps and create Tauri/Sparkle update artifacts. Never publishes."""

import argparse
import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
TAURI_CONFIG = ROOT / "apps/desktop-legacy/src-tauri/tauri.conf.json"
SPARKLE = ROOT / "target/sparkle"
REPOSITORY = "hjinco/mdit"
TARGETS = {"aarch64-apple-darwin": "aarch64", "x86_64-apple-darwin": "x86_64"}
MINIMUM_MACOS = "12.0"


def run(*args, **kwargs):
    try:
        return subprocess.run([str(arg) for arg in args], check=True, **kwargs)
    except subprocess.CalledProcessError as error:
        # notarytool/security arguments may contain credentials. Never echo argv.
        raise RuntimeError(f"{Path(args[0]).name} failed (exit {error.returncode})") from None


def version_tuple(value):
    if not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", value):
        raise ValueError("Release version must be MAJOR.MINOR.PATCH (without v)")
    return tuple(map(int, value.split(".")))


def validate_version(version, previous):
    candidate = version_tuple(version)
    for baseline in (json.loads(TAURI_CONFIG.read_text())["version"], previous.removeprefix("v")):
        if candidate <= version_tuple(baseline):
            raise ValueError(f"{version} must be newer than {baseline}")


def bundle_info(version, arch, public_key):
    version_tuple(version)
    if len(base64.b64decode(public_key, validate=True)) != 32:
        raise ValueError("SPARKLE_PUBLIC_KEY must be a base64 encoded 32-byte public key")
    return {
        "CFBundleName": "Mdit",
        "CFBundleDisplayName": "Mdit",
        "CFBundleIdentifier": "app.mdit",
        # Preserve the old executable path for clients with older relaunch logic.
        "CFBundleExecutable": "mdit",
        "CFBundlePackageType": "APPL",
        "CFBundleVersion": version,
        "CFBundleShortVersionString": version,
        "CFBundleIconFile": "icon.icns",
        "LSMinimumSystemVersion": MINIMUM_MACOS,
        "NSHighResolutionCapable": True,
        "SUFeedURL": f"https://github.com/{REPOSITORY}/releases/latest/download/appcast-{arch}.xml",
        "SUPublicEDKey": public_key,
        "SUEnableAutomaticChecks": True,
        "SUAutomaticallyUpdate": False,
        "SUAllowsAutomaticUpdates": False,
        "SUEnableSystemProfiling": False,
        "SUVerifyUpdateBeforeExtraction": True,
        "SURequireSignedFeed": True,
    }


def sign_bundle(app, identity):
    framework = app / "Contents/Frameworks/Sparkle.framework"
    base = framework / "Versions/B"
    # Sign nested code before containers; never use --deep to sign.
    for path in (
        base / "XPCServices/Downloader.xpc",
        base / "XPCServices/Installer.xpc",
        base / "Autoupdate",
        base / "Updater.app",
        framework,
        app,
    ):
        options = ["--timestamp", "--options", "runtime"] if identity != "-" else []
        run("codesign", "--force", "--sign", identity, *options, path)
    run("codesign", "--verify", "--deep", "--strict", app)


def make_bundle(args):
    arch = TARGETS[args.target]
    info = bundle_info(args.version, arch, args.public_key)
    app = args.output.resolve() / "Mdit.app"
    if app.exists():
        raise ValueError(f"Output already exists: {app}; choose a fresh output directory")
    if not (SPARKLE / "Sparkle.framework").is_dir():
        raise ValueError("Run python3 tooling/release/download_sparkle.py first")
    actual_arch = "arm64" if arch == "aarch64" else "x86_64"
    run("lipo", args.binary, "-verify_arch", actual_arch)
    contents = app / "Contents"
    (contents / "MacOS").mkdir(parents=True)
    (contents / "Resources").mkdir()
    (contents / "Frameworks").mkdir()
    shutil.copy2(args.binary, contents / "MacOS/mdit")
    (contents / "MacOS/mdit").chmod(0o755)
    shutil.copy2(ROOT / "apps/desktop/resources/icon.icns", contents / "Resources/icon.icns")
    # ditto preserves the symlinks and helper bundles required by Sparkle.
    run("ditto", SPARKLE / "Sparkle.framework", contents / "Frameworks/Sparkle.framework")
    with (contents / "Info.plist").open("wb") as output:
        plistlib.dump(info, output)
    sign_bundle(app, args.identity)
    if args.notarize:
        if args.identity == "-":
            raise ValueError("Notarization requires a Developer ID signing identity")
        upload = args.output / "notarization.zip"
        run("ditto", "-c", "-k", "--keepParent", app, upload)
        run("xcrun", "notarytool", "submit", upload,
            "--apple-id", os.environ["APPLE_ID"],
            "--password", os.environ["APPLE_PASSWORD"],
            "--team-id", os.environ["APPLE_TEAM_ID"], "--wait")
        run("xcrun", "stapler", "staple", app)
        run("xcrun", "stapler", "validate", app)
        run("spctl", "--assess", "--type", "execute", app)
        upload.unlink()
    print(app)


def create_artifacts(args):
    arch = TARGETS[args.target]
    app = args.app.resolve()
    with (app / "Contents/Info.plist").open("rb") as file:
        info = plistlib.load(file)
    version = info["CFBundleVersion"]
    version_tuple(version)
    if info["CFBundleIdentifier"] != "app.mdit":
        raise ValueError("Unexpected bundle identifier")
    # Release artifacts must come from a valid, notarized bundle.
    run("codesign", "--verify", "--deep", "--strict", app)
    run("xcrun", "stapler", "validate", app)
    run("spctl", "--assess", "--type", "execute", app)
    args.output.mkdir(parents=True, exist_ok=False)
    archive = args.output / f"Mdit_{version}_{arch}.app.tar.gz"
    with tarfile.open(archive, "w:gz", format=tarfile.PAX_FORMAT) as tar:
        # Tauri strips exactly one leading component on extraction.
        tar.add(app, arcname="Mdit.app")
    # Tauri uses the existing encrypted minisign key, not the Sparkle key.
    run("pnpm", "dlx", "@tauri-apps/cli@2.12.4", "signer", "sign",
        "--app-version", version, archive)
    run("cargo", "run", "--manifest-path", ROOT / "apps/desktop/Cargo.toml",
        "--locked", "--example", "verify_tauri", "--", archive, TAURI_CONFIG, version)

    # Isolate ZIP files so generate_appcast never indexes the Tauri archive.
    sparkle_output = args.output / "sparkle"
    sparkle_output.mkdir()
    zip_path = sparkle_output / f"Mdit_{version}_{arch}.zip"
    run("ditto", "-c", "-k", "--keepParent", app, zip_path)
    feed = sparkle_output / f"appcast-{arch}.xml"
    # Pass the secret over stdin; it must not appear in argv or logs.
    run(SPARKLE / "bin/generate_appcast", "--ed-key-file", "-",
        "--download-url-prefix", f"https://github.com/{REPOSITORY}/releases/download/v{version}/",
        "--maximum-deltas", "0", "-o", feed, sparkle_output,
        input=os.environ["SPARKLE_PRIVATE_KEY"] + "\n", text=True)
    for file in (zip_path, feed):
        shutil.move(file, args.output / file.name)
    shutil.rmtree(sparkle_output)


def create_manifest(args):
    version_tuple(args.version)
    platforms = {}
    for arch in TARGETS.values():
        filename = f"Mdit_{args.version}_{arch}.app.tar.gz"
        archive = args.directory / filename
        if not archive.is_file():
            raise ValueError(f"Missing archive: {archive}")
        signature = archive.with_name(filename + ".sig").read_text().strip()
        if not signature:
            raise ValueError(f"Missing signature for {filename}")
        for name in (f"Mdit_{args.version}_{arch}.zip", f"appcast-{arch}.xml"):
            if not (args.directory / name).is_file():
                raise ValueError(f"Missing Sparkle artifact: {name}")
        platforms[f"darwin-{arch}"] = {
            "url": f"https://github.com/{REPOSITORY}/releases/download/v{args.version}/{filename}",
            "signature": signature,
        }
    manifest = {
        "version": args.version,
        "notes": "Mdit GPUI release. This version starts with fresh settings.",
        "pub_date": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "platforms": platforms,
    }
    (args.directory / "latest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate-version")
    validate.add_argument("version")
    validate.add_argument("--previous", required=True)
    bundle = commands.add_parser("bundle")
    bundle.add_argument("--version", required=True)
    bundle.add_argument("--target", choices=TARGETS, required=True)
    bundle.add_argument("--binary", type=Path, required=True)
    bundle.add_argument("--output", type=Path, required=True)
    bundle.add_argument("--public-key", default=os.environ.get("SPARKLE_PUBLIC_KEY"), required="SPARKLE_PUBLIC_KEY" not in os.environ)
    bundle.add_argument("--identity", default="-")
    bundle.add_argument("--notarize", action="store_true")
    artifacts = commands.add_parser("artifacts")
    artifacts.add_argument("--app", type=Path, required=True)
    artifacts.add_argument("--target", choices=TARGETS, required=True)
    artifacts.add_argument("--output", type=Path, required=True)
    manifest = commands.add_parser("manifest")
    manifest.add_argument("--version", required=True)
    manifest.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "validate-version":
        validate_version(args.version, args.previous)
    elif args.command == "bundle":
        make_bundle(args)
    elif args.command == "artifacts":
        create_artifacts(args)
    else:
        create_manifest(args)


if __name__ == "__main__":
    main()
