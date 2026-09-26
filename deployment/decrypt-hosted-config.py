#!/usr/bin/env python3
"""Recover the separately encrypted deployment JSON without printing credentials."""
import argparse
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--archive", required=True, type=Path)
parser.add_argument("--key", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
args = parser.parse_args()
blob = args.archive.read_bytes()
if not blob.startswith(b"YAPBACKUP1") or len(blob) < 38:
    raise ValueError("Invalid encrypted configuration")
key = args.key.read_bytes()
if len(key) != 32:
    raise ValueError("Expected a 32-byte recovery key")
# Authentication completes before writing any output. Never overwrite an existing secret file.
plaintext = AESGCM(key).decrypt(blob[10:22], blob[22:], None)
with args.output.open("xb") as output:
    args.output.chmod(0o600)
    output.write(plaintext)
print("Configuration authenticated and written to the private output file.")
