import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "./config.js";
import { run, rendererEnv } from "./process.js";
import { clipDir, clipSchema, readClip } from "./video-clips.js";
import {
  visualAssetPath,
  visualAssetSchema,
  readVisualAsset,
} from "./visual-assets.js";
import { hosted, currentOwner } from "./hosted/integrations.js";

const MiB = 1024 * 1024;
const uploadMetadataSchema = z.object({
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(1200).default(""),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  startSeconds: z.coerce.number().finite().min(0).max(27).default(0),
  durationSeconds: z.coerce.number().finite().min(3).max(5).default(5),
});
type UploadMetadata = z.input<typeof uploadMetadataSchema>;
const trimRangeSchema = z.object({
  fileIndex: z.number().int().min(0).max(7),
  startSeconds: z.number().finite().min(0).max(27),
  durationSeconds: z.number().finite().min(3).max(5),
});
export function parseClipTrimRanges(value: unknown, fileCount: number) {
  if (value === undefined)
    return new Map<number, z.infer<typeof trimRangeSchema>>();
  let decoded: unknown;
  try {
    decoded = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw badRequest("Clip selections must be valid JSON");
  }
  const ranges = z.array(trimRangeSchema).max(8).parse(decoded),
    result = new Map<number, z.infer<typeof trimRangeSchema>>();
  for (const range of ranges) {
    if (range.fileIndex >= fileCount || result.has(range.fileIndex))
      throw badRequest(
        "Each clip selection must refer to one unique uploaded file",
      );
    result.set(range.fileIndex, range);
  }
  return result;
}

const filename = (name: string) =>
  path
    .basename(name)
    .replace(/[\x00-\x1f\x7f]/g, "")
    .slice(0, 200);

function badRequest(message: string) {
  return Object.assign(new Error(message), { status: 400 });
}

export function rasterType(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return "image/jpeg";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return undefined;
}

async function inspect(file: string, demuxer = "mov") {
  return JSON.parse(
    await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-f",
        demuxer,
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        file,
      ],
      { timeout: 20_000, env: rendererEnv() },
    ),
  );
}

/** Normalize user bytes into the same asset shapes already consumed by rendering. */
export async function normalizeUploadedAsset(
  file: { path: string; originalname: string; mimetype: string },
  metadata: UploadMetadata = {},
  owner = "local",
) {
  const meta = uploadMetadataSchema.parse(metadata);
  const stat = await fs.lstat(file.path);
  if (!stat.isFile()) throw badRequest("Upload is not an ordinary file");
  const handle = await fs.open(file.path, "r");
  const prefix = Buffer.alloc(16);
  try {
    await handle.read(prefix, 0, 16, 0);
  } finally {
    await handle.close();
  }
  const imageType = rasterType(prefix);
  const isImage = Boolean(imageType);
  const videoDemuxer =
    prefix.toString("ascii", 4, 8) === "ftyp"
      ? "mov"
      : prefix.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        ? "matroska"
        : undefined;
  const demuxer =
    imageType === "image/png"
      ? "png_pipe"
      : imageType === "image/jpeg"
        ? "jpeg_pipe"
        : imageType === "image/webp"
          ? "webp_pipe"
          : videoDemuxer;
  if (
    !isImage &&
    (!/^video\/(mp4|quicktime|webm|x-matroska)$/.test(file.mimetype) ||
      !videoDemuxer)
  ) {
    throw badRequest(
      "Choose a PNG, JPEG, WebP image or an MP4, MOV, WebM video",
    );
  }
  if (stat.size > (isImage ? 20 : 100) * MiB)
    throw badRequest(
      isImage ? "Images must be under 20 MiB" : "Clips must be under 100 MiB",
    );
  const info = await inspect(file.path, demuxer!);
  const video = info.streams.find((s: any) => s.codec_type === "video");
  if (
    !video ||
    video.width < 1 ||
    video.height < 1 ||
    video.width * video.height > 50_000_000 ||
    Math.max(video.width, video.height) > 20_000
  ) {
    throw badRequest("Unsupported media dimensions (maximum 50 megapixels)");
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "yap-normalize-"));
  const common = {
    title: meta.title || filename(file.originalname),
    description: meta.description,
    tags: meta.tags,
    originalFilename: filename(file.originalname),
    retrievedAt: new Date().toISOString(),
    sourceType: "upload" as const,
    permissionStatus: "user-provided" as const,
  };
  try {
    if (isImage) {
      const normalized = path.join(temp, "image.png");
      await run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-protocol_whitelist",
          "file,pipe",
          "-f",
          demuxer!,
          "-threads",
          "1",
          "-i",
          file.path,
          "-frames:v",
          "1",
          "-vf",
          "scale='min(2048,iw)':'min(2048,ih)':force_original_aspect_ratio=decrease",
          "-update",
          "1",
          normalized,
        ],
        { timeout: 30_000, env: rendererEnv() },
      );
      const bytes = await fs.readFile(normalized);
      // Scope content IDs by owner to avoid sharing metadata across accounts.
      const id = createHash("sha256")
        .update(owner)
        .update("\0")
        .update(bytes)
        .digest("hex");
      const asset = visualAssetSchema.parse({
        ...common,
        id,
        creator: "Your uploaded image",
        sourceUrl: `https://educative-yap.invalid/uploads/${id}`,
        imageUrl: `https://educative-yap.invalid/uploads/${id}`,
        license: "User-provided; rights not independently verified",
        licenseUrl: "",
        contentType: "image/png",
      });
      const destination = visualAssetPath(id);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, bytes, { mode: 0o600 });
      await fs.writeFile(destination + ".json", JSON.stringify(asset), {
        mode: 0o600,
      });
      return {
        ...asset,
        kind: "image" as const,
        renderUrl: `visual-${id}`,
        contentUrl: `/api/assets/${id}/content`,
      };
    }
    const sourceDuration = Number(info.format.duration);
    if (
      !Number.isFinite(sourceDuration) ||
      sourceDuration < 3 ||
      sourceDuration > 30.1
    )
      throw badRequest("Upload a clip between 3 and 30 seconds long");
    const remaining = sourceDuration - meta.startSeconds;
    const requestedDuration =
      metadata.durationSeconds === undefined
        ? Math.min(5, remaining)
        : meta.durationSeconds;
    if (meta.startSeconds + requestedDuration > sourceDuration + 0.05)
      throw badRequest(
        "The selected excerpt extends beyond the end of the video. Move the start earlier or shorten it.",
      );
    const duration = Math.min(requestedDuration, remaining);
    if (duration < 3)
      throw badRequest(
        "Choose a start time leaving at least 3 seconds of video",
      );
    const id = randomUUID(),
      destination = clipDir(id);
    const output = path.join(temp, "clip.mp4");
    await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-f",
        demuxer!,
        "-ss",
        String(meta.startSeconds),
        "-i",
        file.path,
        "-t",
        String(duration),
        "-an",
        "-vf",
        "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: 90_000, env: rendererEnv() },
    );
    await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-i",
        output,
        "-an",
        "-q:v",
        "3",
        "-start_number",
        "0",
        path.join(temp, "frame-%03d.jpg"),
      ],
      { timeout: 45_000, env: rendererEnv() },
    );
    const normalizedInfo = await inspect(output);
    const stream = normalizedInfo.streams.find(
      (s: any) => s.codec_type === "video",
    );
    const seconds = Number(normalizedInfo.format.duration);
    const frameCount = (await fs.readdir(temp)).filter((name) =>
      /^frame-\d{3}\.jpg$/.test(name),
    ).length;
    const asset = clipSchema.parse({
      ...common,
      id,
      channel: "Your uploads",
      channelUrl: "",
      creator: "Uploader",
      sourceUrl: `https://educative-yap.invalid/uploads/${id}`,
      sourceStart: meta.startSeconds,
      sourceEnd: meta.startSeconds + seconds,
      duration: seconds,
      width: stream.width,
      height: stream.height,
      fps: 30,
      frameCount,
      license: "User-provided; rights not independently verified",
      purpose: meta.description || "User-provided footage for this explainer",
      audio: "muted",
    });
    await fs.writeFile(path.join(temp, "clip.json"), JSON.stringify(asset), {
      mode: 0o600,
    });
    await fs.mkdir(destination, { recursive: true });
    for (const name of await fs.readdir(temp))
      await fs.copyFile(path.join(temp, name), path.join(destination, name));
    return {
      ...asset,
      kind: "clip" as const,
      contentUrl: `/api/assets/${id}/content`,
    };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

async function persist(
  asset: Awaited<ReturnType<typeof normalizeUploadedAsset>>,
) {
  if (!hosted) return;
  const owner = currentOwner();
  if (!owner)
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  const files: Record<string, string> = {};
  if (asset.kind === "image") {
    files.image = await hosted.storage.putFile(
      owner,
      asset.id,
      "image.png",
      visualAssetPath(asset.id),
      "image/png",
    );
  } else {
    // Store clip source plus decoded frames; recovery does not depend on original upload.
    const names = (await fs.readdir(clipDir(asset.id))).filter((name) =>
      /^(clip\.mp4|clip\.json|frame-\d{3}\.jpg)$/.test(name),
    );
    for (let i = 0; i < names.length; i += 16)
      await Promise.all(
        names.slice(i, i + 16).map(async (name) => {
          files[name] = await hosted!.storage.putFile(
            owner,
            asset.id,
            name,
            path.join(clipDir(asset.id), name),
            name.endsWith(".mp4")
              ? "video/mp4"
              : name.endsWith(".json")
                ? "application/json"
                : "image/jpeg",
          );
        }),
      );
  }
  await hosted.store.saveAsset(
    owner,
    asset.id,
    asset.kind,
    { ...asset, files },
    asset.kind === "image" ? files.image : files["clip.mp4"],
  );
}

export function createAssetUploadRouter() {
  const router = Router();
  router.get("/", async (req, res, next) => {
    if (hosted) {
      next();
      return;
    }
    const assets: { id: string; kind: string; metadata: unknown }[] = [];
    const query = String(req.query.q || "")
      .toLowerCase()
      .slice(0, 240);
    for (const name of await fs
      .readdir(path.join(config.data, "visual-assets"))
      .catch(() => [])) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const asset = await readVisualAsset(name.slice(0, -5)).catch(
        () => undefined,
      );
      if (asset && JSON.stringify(asset).toLowerCase().includes(query))
        assets.push({ id: asset.id, kind: "image", metadata: asset });
    }
    for (const name of await fs
      .readdir(path.join(config.data, "video-clips"))
      .catch(() => [])) {
      if (!/^[a-f0-9-]{36}$/.test(name)) continue;
      const asset = await readClip(name).catch(() => undefined);
      if (asset && JSON.stringify(asset).toLowerCase().includes(query))
        assets.push({ id: asset.id, kind: "clip", metadata: asset });
    }
    res.json({ assets: assets.slice(-100).reverse() });
  });
  const upload = multer({
    dest: path.join(config.data, "upload-staging"),
    limits: { files: 8, fileSize: 100 * MiB, fields: 8, fieldSize: 16_000 },
  }).array("files", 8);
  router.post("/upload", (req, res, next) => {
    if (hosted && !currentOwner())
      return next(
        Object.assign(new Error("Authentication required"), { status: 401 }),
      );
    upload(req, res, (error) => {
      void (async () => {
        const files = (
          Array.isArray(req.files) ? req.files : []
        ) as Express.Multer.File[];
        try {
          if (error) throw error;
          if (!files.length)
            throw badRequest("Choose at least one image or video");
          const rawTags = req.body.tags || "";
          const tags = rawTags.startsWith("[")
            ? JSON.parse(rawTags)
            : rawTags
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean);
          const meta = uploadMetadataSchema.parse({ ...req.body, tags });
          const trims = parseClipTrimRanges(req.body.trimRanges, files.length);
          const assets = [];
          for (const [fileIndex, file] of files.entries()) {
            const trim = trims.get(fileIndex);
            const selection = { ...meta, ...trim };
            // Keep the established default for short uploads when no length was explicitly selected.
            if (!trim && req.body.durationSeconds === undefined)
              delete (selection as Partial<typeof selection>).durationSeconds;
            const asset = await normalizeUploadedAsset(
              file,
              selection,
              currentOwner() || "local",
            );
            await persist(asset);
            assets.push({ ...asset, metadata: asset });
          }
          res.status(201).json({ assets });
        } finally {
          await Promise.all(
            files.map((file) => fs.rm(file.path, { force: true })),
          );
        }
      })().catch(next);
    });
  });
  router.get("/:id/content", async (req, res) => {
    const id = String(req.params.id);
    if (!/^(?:[a-f0-9]{64}|[a-f0-9-]{36})$/.test(id))
      throw badRequest("Invalid asset ID");
    const owner = currentOwner();
    const record = hosted ? await hosted.store.getAsset(owner!, id) : undefined;
    const kind = record?.kind || (id.length === 64 ? "image" : "clip");
    const file =
      kind === "image"
        ? visualAssetPath(id)
        : path.join(clipDir(id), "clip.mp4");
    try {
      await fs.access(file);
    } catch {
      if (!hosted || !record?.object_key) {
        res.sendStatus(404);
        return;
      }
      await hosted.storage.downloadFile(owner!, record.object_key, file);
    }
    res.set({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res
      .type(
        kind === "image"
          ? record?.metadata?.contentType ||
              (await readVisualAsset(id)).contentType
          : "mp4",
      )
      .sendFile(file, { dotfiles: "allow" });
  });
  return router;
}
