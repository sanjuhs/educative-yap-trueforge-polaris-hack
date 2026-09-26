#!/usr/bin/env python3
"""Authenticate, verify and safely restore an Educative Yap runtime backup.

Requires `pip install cryptography`. The recovery key must remain private.
Restores into a NEW/EMPTY directory; never overwrites an existing app runtime.
"""
import argparse
import hashlib
import hmac
import json
from pathlib import Path
import tarfile
import tempfile

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

HEADER = b"YAPBACKUP1"


def restore(archive: Path, key_file: Path, manifest_file: Path, destination: Path | None):
    key = key_file.read_bytes()
    if len(key) != 32:
        raise ValueError("Expected a 32-byte AES recovery key")
    manifest = json.loads(manifest_file.read_text())
    if archive.stat().st_size != manifest["bytes"]:
        raise ValueError("Encrypted backup size differs from manifest")
    digest = hashlib.sha256()
    with archive.open("rb") as source:
        while block := source.read(1024 * 1024):
            digest.update(block)
    if not hmac.compare_digest(digest.hexdigest(), manifest["sha256"]):
        raise ValueError("Encrypted backup SHA-256 differs from manifest")
    with tempfile.TemporaryDirectory(prefix="yap-restore-") as temporary:
        plaintext = Path(temporary) / "runtime.tar.gz"
        with archive.open("rb") as source, plaintext.open("xb") as output:
            plaintext.chmod(0o600)
            if source.read(len(HEADER)) != HEADER:
                raise ValueError("Unsupported backup header")
            nonce = source.read(12)
            source.seek(-16, 2)
            tag = source.read(16)
            remaining = archive.stat().st_size - len(HEADER) - 12 - 16
            source.seek(len(HEADER) + 12)
            decryptor = Cipher(algorithms.AES(key), modes.GCM(nonce, tag)).decryptor()
            while remaining:
                block = source.read(min(1024 * 1024, remaining))
                if not block:
                    raise ValueError("Truncated encrypted backup")
                remaining -= len(block)
                output.write(decryptor.update(block))
            # Authenticate BEFORE opening/extracting any plaintext archive member.
            output.write(decryptor.finalize())
        with tarfile.open(plaintext, "r:gz") as tar:
            members = tar.getmembers()
            for member in members:
                parts = Path(member.name).parts
                if (not parts or parts[0] != ".data" or ".." in parts
                        or member.name.startswith("/")
                        or not (member.isfile() or member.isdir())):
                    raise ValueError("Unsafe backup archive member")
                member.mode = 0o700 if member.isdir() else 0o600
            if destination is not None:
                if destination.is_symlink() or (destination.exists() and any(destination.iterdir())):
                    raise ValueError("Restore destination must be a new or empty directory")
                destination.mkdir(mode=0o700, parents=True, exist_ok=True)
                tar.extractall(destination, members=members, filter="data")
            return {"authenticated": True, "sha256Verified": True, "members": len(members),
                    "sourceTag": manifest["sourceTag"], "restored": destination is not None}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--key", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--verify-only", action="store_true")
    group.add_argument("--destination", type=Path)
    args = parser.parse_args()
    print(json.dumps(restore(args.archive, args.key, args.manifest, args.destination), indent=2))
