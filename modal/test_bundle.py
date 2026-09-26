"""Local archive-boundary regression tests: python3 -m unittest discover -s modal."""
import io
import json
import tarfile
import unittest
from renderer import check_bundle


def bundle(extra=None):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as archive:
        content = json.dumps({"duration": 5, "plan": {}}).encode()
        member = tarfile.TarInfo("job/render-input.json")
        member.size = len(content)
        archive.addfile(member, io.BytesIO(content))
        if extra:
            archive.addfile(extra, io.BytesIO(b""))
    return output.getvalue()


class BundleBoundary(unittest.TestCase):
    def test_minimal_job(self):
        self.assertEqual(check_bundle(bundle())["duration"], 5)

    def test_traversal(self):
        with self.assertRaises(ValueError):
            check_bundle(bundle(tarfile.TarInfo("../.env")))

    def test_undeclared_file(self):
        with self.assertRaises(ValueError):
            check_bundle(bundle(tarfile.TarInfo(".env")))

    def test_symlink(self):
        member = tarfile.TarInfo("job/hack")
        member.type = tarfile.SYMTYPE
        member.linkname = "/etc/passwd"
        with self.assertRaises(ValueError):
            check_bundle(bundle(member))


if __name__ == "__main__":
    unittest.main()
