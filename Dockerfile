FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    YT_DLP_PATH=/opt/clip-tools/bin/yt-dlp \
    CUTOUT_BACKEND=mediapipe \
    STUDIO_PORT=8789 \
    PORT=8790
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-venv ca-certificates curl gosu tini build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# tsx is the runtime launcher, so retain pinned development dependencies.
RUN npm ci --include=dev --no-audit --no-fund \
    && npx playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright
COPY requirements-clips.txt ./
RUN python3 -m venv /opt/clip-tools \
    && /opt/clip-tools/bin/pip install --no-cache-dir -r requirements-clips.txt
RUN mkdir -p /opt/yap-models \
    && curl --fail --silent --show-error --location \
      https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite \
      -o /opt/yap-models/selfie_multiclass.tflite \
    && echo 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0  /opt/yap-models/selfie_multiclass.tflite' | sha256sum --check
COPY . .
RUN chmod +x scripts/start-hosted.sh && mkdir -p /app/.data && chown node:node /app/.data
EXPOSE 8789
HEALTHCHECK --interval=20s --timeout=5s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8789/api/health').then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(j=>{if(!j.ready)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--", "/app/scripts/start-hosted.sh"]
