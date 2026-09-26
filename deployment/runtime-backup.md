# Runtime recovery

The public source tag `pre-hosted-2026-09-26` preserves the application before hosted changes. Runtime videos, designs, source assets, projects and a consistent TrueForge SQLite snapshot are separately encrypted in the private repository [`sanjuhs/educative-yap-private-backup`](https://github.com/sanjuhs/educative-yap-private-backup), release `pre-hosted-2026-09-26`.

The runtime archive uses AES-256-GCM. Its manifest includes the encrypted archive's SHA-256 and size. The file format is a **10-byte** `YAPBACKUP1` header, a 12-byte nonce, ciphertext, and a 16-byte authentication tag. The 32-byte `recovery.key` is deliberately not uploaded. Keep a separate offline copy; losing this key makes the archive unrecoverable.

Environment files, downloadable clip-tool dependencies, logs and deployment administration files are excluded. Recreate provider configuration separately from the deployment secret store. This runtime snapshot supplements Git; Git alone does not contain ignored media or private state.

Install `cryptography` into a Python 3.12+ virtual environment. Download the two release attachments to a private directory, and supply the separately retained key:

```sh
python deployment/restore-runtime-backup.py \
  --archive /private/backup/educative-yap-runtime-2026-09-26.tar.gz.aes \
  --key /private/offline/recovery.key \
  --manifest /private/backup/manifest.json \
  --verify-only
```

To restore, replace `--verify-only` with `--destination /private/recovered-yap`. The destination must be new or empty. The script verifies SHA-256 and completes AES-GCM authentication before extracting anything, refuses symbolic links/traversal, and uses private file permissions. It never overwrites the running app. Restore the tagged source separately, inspect the recovered state, stop the application, and then deliberately migrate the verified `.data` directory into the desired checkout.

Verification on 2026-09-26 authenticated the original 581,065,520-byte archive, matched SHA-256 and inspected 1,296 safe archive entries. Regression tests exercise authenticated restore, wrong keys, traversal and preservation of a nonempty destination:

```sh
python -m unittest discover -s deployment
```

The private release also contains `educative-yap-hosted-config-2026-09-26.json.aes`, a separately authenticated snapshot of the new hosted deployment settings, including the R2 encryption key. It uses the same privately retained recovery key. This is a JSON payload, not the runtime tar archive. Recover it without printing secrets:

```sh
python deployment/decrypt-hosted-config.py \
  --archive /private/backup/educative-yap-hosted-config-2026-09-26.json.aes \
  --key /private/offline/recovery.key \
  --output /private/recovered-hosted-config.json
```

The output must not already exist. Store recovered configuration in a secret manager; never add it to a source checkout. Future credential rotations require updating this recovery snapshot.
