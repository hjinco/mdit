import argparse
import base64
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release


class ReleaseTests(unittest.TestCase):
    def test_version_must_advance_published_and_legacy_versions(self):
        with patch.object(release, "TAURI_CONFIG") as config:
            config.read_text.return_value = '{"version":"0.8.4"}'
            release.validate_version("1.0.0", "v0.9.0")
            for version, previous in (("0.8.4", "v0.8.3"), ("0.9.0", "v1.0.0"), ("1.0.0", "v1.0.0")):
                with self.subTest(version=version, previous=previous), self.assertRaises(ValueError):
                    release.validate_version(version, previous)

    def test_rejects_versions_that_cannot_be_release_paths(self):
        for value in ("v1.0.0", "1.0", "01.2.3", "1.0.0-beta", "../1.0.0", "1.0.0\n"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                release.version_tuple(value)

    def test_bundle_identity_update_consent_and_architecture(self):
        key = base64.b64encode(bytes(range(32))).decode()
        for arch in release.TARGETS.values():
            info = release.bundle_info("1.0.0", arch, key)
            self.assertEqual(info["CFBundleIdentifier"], "app.mdit")
            self.assertEqual(info["CFBundleExecutable"], "mdit")
            self.assertEqual(info["CFBundleVersion"], "1.0.0")
            self.assertTrue(info["SUFeedURL"].endswith(f"/appcast-{arch}.xml"))
            self.assertTrue(info["SUEnableAutomaticChecks"])
            self.assertFalse(info["SUAutomaticallyUpdate"])
            self.assertFalse(info["SUAllowsAutomaticUpdates"])
            self.assertTrue(info["SURequireSignedFeed"])
            self.assertTrue(info["SUVerifyUpdateBeforeExtraction"])

    def test_rejects_placeholder_sparkle_key(self):
        with self.assertRaises(ValueError):
            release.bundle_info("1.0.0", "aarch64", "")

    def test_manifest_requires_both_architectures_and_both_update_formats(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            args = argparse.Namespace(version="1.0.0", directory=directory)
            for arch in release.TARGETS.values():
                for suffix in (".app.tar.gz", ".app.tar.gz.sig", ".zip"):
                    (directory / f"Mdit_1.0.0_{arch}{suffix}").write_text("test-signature")
                (directory / f"appcast-{arch}.xml").write_text("test-feed")
            release.create_manifest(args)
            manifest = json.loads((directory / "latest.json").read_text())
            self.assertEqual(set(manifest["platforms"]), {"darwin-aarch64", "darwin-x86_64"})
            self.assertEqual(manifest["version"], "1.0.0")
            self.assertEqual(manifest["platforms"]["darwin-aarch64"]["signature"], "test-signature")
            self.assertIn("/v1.0.0/Mdit_1.0.0_aarch64.app.tar.gz", manifest["platforms"]["darwin-aarch64"]["url"])
            (directory / "appcast-x86_64.xml").unlink()
            with self.assertRaises(ValueError):
                release.create_manifest(args)


if __name__ == "__main__":
    unittest.main()
