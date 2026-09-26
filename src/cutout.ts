import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { config } from "./config.js";
import { run, probe, rendererEnv } from "./process.js";
import { presenterDir, type PresenterAsset } from "./presenter.js";
import type { Plan } from "./schema.js";
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite";
const modelHash =
  "c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0";
export async function ensureSegmentationModel() {
  const dir = path.join(config.data, "models"),
    file = path.join(dir, "selfie_multiclass.tflite");
  await fs.mkdir(dir, { recursive: true });
  let bytes = await fs.readFile(file).catch(() => undefined);
  if (!bytes) {
    const r = await fetch(modelUrl, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error("Cannot download local segmentation model");
    bytes = Buffer.from(await r.arrayBuffer());
  }
  if (createHash("sha256").update(bytes).digest("hex") !== modelHash)
    throw new Error("Segmentation model checksum mismatch");
  await fs.writeFile(file, bytes);
  return file;
}
export async function prepareCutout(
  asset: PresenterAsset,
  onProgress?: (s: string) => void,
) {
  const dir = presenterDir(asset.id),
    mask = path.join(dir, "person-mask-v1.mp4"),
    source = path.join(dir, "person-source-v1.mp4");
  const backend = process.env.CUTOUT_BACKEND || "auto";
  if (!["auto", "vision", "mediapipe"].includes(backend))
    throw new Error("CUTOUT_BACKEND must be auto, vision or mediapipe");
  if (backend === "vision" && process.platform !== "darwin")
    throw new Error("Apple Vision cutouts require macOS");
  const cached = await fs
    .readFile(path.join(dir, "cutout-engine.json"), "utf8")
    .then(JSON.parse)
    .catch(() => undefined);
  const exists = await Promise.all(
    [mask, source].map((file) =>
      fs
        .stat(file)
        .then((s) => s.size > 0)
        .catch(() => false),
    ),
  );
  if (
    exists.every(Boolean) &&
    cached &&
    (backend === "auto" ||
      cached.engine === (backend === "vision" ? "apple-vision" : "mediapipe"))
  )
    return { mask, source };

  const meta = await probe(path.join(dir, "original-video")),
    v = meta.streams.find((s: any) => s.codec_type === "video");
  const hdr = ["arib-std-b67", "smpte2084"].includes(v.color_transfer);
  const tone = hdr
    ? "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,"
    : "";
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    path.join(dir, "original-video"),
    "-an",
    "-vf",
    tone + "scale=-2:1280,fps=30,setsar=1",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-movflags",
    "+faststart",
    source,
  ]);
  let engine = "mediapipe";
  if (process.platform === "darwin" && backend !== "mediapipe") {
    try {
      const script = path.join(config.root, "scripts/person-matte.swift");
      const hash = createHash("sha256")
        .update(await fs.readFile(script))
        .digest("hex")
        .slice(0, 16);
      const bin = path.join(
        config.data,
        "bin",
        `person-matte-${process.arch}-${hash}`,
      );
      await fs.mkdir(path.dirname(bin), { recursive: true });
      if (
        !(await fs
          .stat(bin)
          .then(() => true)
          .catch(() => false))
      )
        await run("swiftc", ["-O", script, "-o", bin], {
          timeout: 120000,
          onOutput: onProgress,
        });
      await run(bin, [source, path.join(dir, "person-mask-v1.pending.mp4")], {
        timeout: 900000,
        onOutput: onProgress,
      });
      engine = "apple-vision";
    } catch (err) {
      if (backend === "vision") throw err;
      onProgress?.(
        "Apple Vision unavailable; using local MediaPipe segmentation.\n",
      );
    }
  }
  if (engine === "mediapipe") {
    await ensureSegmentationModel();
    await run(
      process.execPath,
      [
        "--import",
        "tsx",
        path.join(config.root, "src/cutout-worker.ts"),
        dir,
        String(asset.duration),
      ],
      { timeout: 900000, onOutput: onProgress, env: rendererEnv() },
    );
  }
  await fs.writeFile(
    path.join(dir, "cutout-engine.json"),
    JSON.stringify({ engine, maskFps: 15 }, null, 2),
  );
  await fs.rename(path.join(dir, "person-mask-v1.pending.mp4"), mask);
  return { mask, source };
}
export async function compositeCutout(
  dir: string,
  asset: PresenterAsset,
  plan: Plan,
  onProgress?: (s: string) => void,
) {
  const { mask, source } = await prepareCutout(asset, onProgress);
  const stamp = (s: number) => {
    const n = Math.round(s * 100);
    return `${Math.floor(n / 360000)}:${String(Math.floor(n / 6000) % 60).padStart(2, "0")}:${String(Math.floor(n / 100) % 60).padStart(2, "0")}.${String(n % 100).padStart(2, "0")}`;
  };
  const safe = (s: string) => s.replace(/[{}\\\r\n]/g, " ");
  const ass =
    `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,43,&H00FFFFFF,&H00FFFFFF,&H99000000,&H99000000,1,0,0,0,100,100,0,0,3,9,0,2,70,70,90,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
    asset.captions
      .map(
        (c) =>
          `Dialogue: 0,${stamp(c.start)},${stamp(c.end)},Default,,0,0,0,,${safe(c.text)}`,
      )
      .join("\n");
  await fs.writeFile(path.join(dir, "presenter-captions.ass"), ass);

  const box = plan.presenterPlacement || {
    x: 500,
    y: 1000,
    width: 580,
    height: 920,
  };
  const sourceMeta = await probe(source),
    v = sourceMeta.streams.find((s: any) => s.codec_type === "video");
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      path.join(dir, "render.mp4"),
      "-i",
      source,
      "-i",
      mask,
      "-i",
      path.join(presenterDir(asset.id), "voice.wav"),
      "-filter_complex",
      `[1:v]setpts=PTS-STARTPTS[person];[2:v]scale=${v.width}:${v.height},format=gray,setpts=PTS-STARTPTS[mask];[person][mask]alphamerge,scale=${box.width}:${box.height}:force_original_aspect_ratio=decrease[fg];[0:v][fg]overlay=x=${box.x}+(${box.width}-overlay_w)/2:y=${box.y}+${box.height}-overlay_h:shortest=1,format=yuv420p[layer];[layer]subtitles=presenter-captions.ass[v]`,
      "-map",
      "[v]",
      "-map",
      "3:a:0",
      "-t",
      String(asset.duration),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      path.join(dir, "presenter.mp4"),
    ],
    { cwd: dir },
  );
}
