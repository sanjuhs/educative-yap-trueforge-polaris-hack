import importlib.util
import io
import json
import hashlib
from pathlib import Path
import os
import tarfile
import tempfile
import unittest

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

spec = importlib.util.spec_from_file_location("restore", Path(__file__).with_name("restore-runtime-backup.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BackupRestore(unittest.TestCase):
    def fixture(self, root, member=".data/test.txt", bad_key=False):
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode="w:gz") as archive:
            info = tarfile.TarInfo(member)
            info.size = 4
            archive.addfile(info, io.BytesIO(b"test"))
        key, nonce = os.urandom(32), os.urandom(12)
        encryptor = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
        encrypted = module.HEADER + nonce + encryptor.update(raw.getvalue()) + encryptor.finalize() + encryptor.tag
        a, k, m = root / "archive", root / "key", root / "manifest"
        a.write_bytes(encrypted)
        k.write_bytes(os.urandom(32) if bad_key else key)
        m.write_text(json.dumps({"bytes": len(encrypted), "sha256": hashlib.sha256(encrypted).hexdigest(), "sourceTag": "test"}))
        return a, k, m

    def test_authenticated_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = module.restore(*self.fixture(root), root / "output")
            self.assertTrue(result["authenticated"])
            self.assertEqual((root / "output/.data/test.txt").read_bytes(), b"test")

    def test_bad_key_never_extracts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaises(InvalidTag):
                module.restore(*self.fixture(root, bad_key=True), root / "output")
            self.assertFalse((root / "output").exists())

    def test_traversal_never_extracts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaises(ValueError):
                module.restore(*self.fixture(root, "../escape"), root / "output")
            self.assertFalse((root / "output").exists())

    def test_existing_destination_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output = root / "output"
            output.mkdir()
            (output / "existing").write_text("preserve")
            with self.assertRaises(ValueError):
                module.restore(*self.fixture(root), output)
            self.assertEqual((output / "existing").read_text(), "preserve")


if __name__ == "__main__":
    unittest.main()
