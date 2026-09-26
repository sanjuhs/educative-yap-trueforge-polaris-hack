#!/bin/sh
set -eu
# Coolify mounts this named volume as root on first deployment. Keep the app
# process unprivileged while preserving SQLite, downloaded clips and work files.
mkdir -p /app/.data/models
if [ ! -f /app/.data/models/selfie_multiclass.tflite ]; then
  cp /opt/yap-models/selfie_multiclass.tflite /app/.data/models/
fi
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/.data
  exec gosu node node --import tsx src/start.ts
fi
exec node --import tsx src/start.ts
