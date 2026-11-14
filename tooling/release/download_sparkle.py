#!/usr/bin/env python3
"""Fetch the official Sparkle distribution, pinned by version and SHA-256."""

import hashlib
from pathlib import Path
import subprocess

VERSION = "2.10.1"
SHA256 = "1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27"
DESTINATION = Path(__file__).resolve().parents[2] / "target" / "sparkle"


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    archive = DESTINATION / f"Sparkle-{VERSION}.tar.xz"
    if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        subprocess.run([
            "curl", "--fail", "--location", "--retry", "3",
            f"https://github.com/sparkle-project/Sparkle/releases/download/{VERSION}/{archive.name}",
            "--output", str(archive),
        ], check=True)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise SystemExit("Sparkle archive checksum mismatch")
    subprocess.run(["tar", "-xJf", str(archive), "-C", str(DESTINATION)], check=True)
    print(DESTINATION)


if __name__ == "__main__":
    main()
