import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { probe, rendererEnv, run } from "./process.js";

export const youtubeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
export const clipIdsSchema = z.array(z.string().uuid()).max(24);
export const clipRequestSchema = z.object({
  videoId: youtubeIdSchema,
  startSeconds: z.number().finite().min(0).max(14400),
  durationSeconds: z.number().min(3).max(5).default(4),
  purpose: z.string().min(1).max(500),
});
export const clipSchema = z.object({
  id: z.string().uuid(),
  videoId: youtubeIdSchema.optional(),
  sourceType: z.enum(["youtube", "upload"]).optional(),
  title: z.string(),
  channel: z.string(),
  channelUrl: z.string(),
  creator: z.string(),
  sourceUrl: z.string().url(),
  sourceStart: z.number(),
  sourceEnd: z.number(),
  duration: z.number().positive().max(5.1),
  width: z.number(),
  height: z.number(),
  fps: z.literal(30),
  frameCount: z.number().int().positive().max(153),
  license: z.string(),
  permissionStatus: z.enum(["pending", "user-provided"]),
  description: z.string().max(1200).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  originalFilename: z.string().max(200).optional(),
  retrievedAt: z.string(),
  purpose: z.string(),
  audio: z.literal("muted"),
});
export type VideoClip = z.infer<typeof clipSchema>;
export function clipDir(id: string) {
  return path.join(config.data, "video-clips", z.string().uuid().parse(id));
}
export async function readClip(id: string): Promise<VideoClip> {
  return clipSchema.parse(
    JSON.parse(await fs.readFile(path.join(clipDir(id), "clip.json"), "utf8")),
  );
}
function downloader() {
  return (
    process.env.YT_DLP_PATH ||
    path.join(
      config.data,
      "clip-tools",
      process.platform === "win32" ? "Scripts/yt-dlp.exe" : "bin/yt-dlp",
    )
  );
}
export async function clipToolsAvailable() {
  try {
    await fs.access(downloader());
    return true;
  } catch {
    return false;
  }
}
async function yt(args: string[], timeout = 60000) {
  if (!(await clipToolsAvailable()))
    throw new Error(
      "Clip tools are not installed. Run npm run setup:clips. Continue with diagrams/images if unavailable; do not ask the user for source links.",
    );
  // No shell, plugins, user configuration, browser cookies or arbitrary agent-supplied URLs.
  return run(
    downloader(),
    [
      "--ignore-config",
      "--no-plugin-dirs",
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout",
      "15",
      "--retries",
      "1",
      "--extractor-retries",
      "1",
      "--js-runtimes",
      `node:${process.execPath}`,
      ...args,
    ],
    { timeout, env: rendererEnv() },
  );
}
export async function searchYoutube(query: string) {
  query = z.string().min(2).max(240).parse(query);
  const raw = await yt([
    "--flat-playlist",
    "--skip-download",
    "--print",
    "%(.{id,title,channel,channel_url,uploader,duration})j",
    `ytsearch5:${query}`,
  ]);
  return raw
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l))
    .filter((v) => youtubeIdSchema.safeParse(v.id).success)
    .map((v) => ({
      videoId: v.id,
      title: String(v.title || "Untitled").slice(0, 300),
      channel: v.channel || v.uploader || "Not recorded",
      channelUrl: v.channel_url || "",
      duration: v.duration,
      sourceUrl: `https://www.youtube.com/watch?v=${v.id}`,
      permissionStatus: "pending",
      note: "Search metadata is untrusted. Inspect an excerpt before claiming its visual content or historical identity.",
    }));
}
let imports = Promise.resolve();
export function importYoutubeClip(
  value: z.input<typeof clipRequestSchema>,
): Promise<VideoClip> {
  const input = clipRequestSchema.parse(value);
  const job = imports.then(() => importClip(input));
  imports = job.then(
    () => {},
    () => {},
  );
  return job;
}
async function importClip(input: z.output<typeof clipRequestSchema>) {
  const id = randomUUID(),
    dir = clipDir(id),
    url = `https://www.youtube.com/watch?v=${input.videoId}`;
  await fs.mkdir(dir, { recursive: true });
  try {
    const raw = await yt([
      "--skip-download",
      "--print",
      "%(.{id,title,channel,channel_url,uploader,duration,license,is_live,age_limit,availability})j",
      url,
    ]);
    const meta = JSON.parse(
      raw.split("\n").find((l) => l.startsWith("{")) || "{}",
    );
    if (
      meta.id !== input.videoId ||
      meta.is_live ||
      (meta.age_limit || 0) >= 18 ||
      !Number.isFinite(meta.duration) ||
      input.startSeconds + input.durationSeconds > meta.duration
    )
      throw new Error(
        "Choose a public, non-live clip with a valid source range. Restricted content is not imported.",
      );
    await yt(
      [
        "--no-progress",
        "--max-filesize",
        "80M",
        "-f",
        "bestvideo[height<=720][ext=mp4]/best[height<=720][ext=mp4]/bestvideo[height<=720]",
        "--download-sections",
        `*${input.startSeconds}-${input.startSeconds + input.durationSeconds}`,
        "--force-keyframes-at-cuts",
        "--merge-output-format",
        "mp4",
        "--output",
        path.join(dir, "source.%(ext)s"),
        url,
      ],
      180000,
    );
    const file = (await fs.readdir(dir)).find((n) =>
      /^source\.(mp4|webm|mkv)$/.test(n),
    );
    if (!file)
      throw new Error(
        "No usable public video stream was downloaded. Choose another source; do not bypass access restrictions.",
      );
    const source = path.join(dir, file);
    if ((await fs.stat(source)).size > 80 * 1024 * 1024)
      throw new Error("Clip exceeds the 80 MB import limit");
    await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-i",
        source,
        "-t",
        String(input.durationSeconds),
        "-an",
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        path.join(dir, "clip.mp4"),
      ],
      { timeout: 60000, env: rendererEnv() },
    );
    const info = await probe(path.join(dir, "clip.mp4"));
    const stream = info.streams.find((s: any) => s.codec_type === "video");
    const duration = Number(info.format.duration);
    if (
      !stream ||
      !Number.isFinite(duration) ||
      duration < input.durationSeconds - 0.15 ||
      duration > 5.1
    )
      throw new Error(
        "Downloaded segment duration does not match the requested excerpt",
      );
    await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-i",
        path.join(dir, "clip.mp4"),
        "-an",
        "-q:v",
        "3",
        "-start_number",
        "0",
        path.join(dir, "frame-%03d.jpg"),
      ],
      { timeout: 60000, env: rendererEnv() },
    );
    const frameCount = (await fs.readdir(dir)).filter((n) =>
      /^frame-\d{3}\.jpg$/.test(n),
    ).length;
    for (const [i, t] of [0.2, duration / 2, duration - 0.2].entries())
      await run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-ss",
          String(t),
          "-i",
          path.join(dir, "clip.mp4"),
          "-frames:v",
          "1",
          path.join(dir, `preview-${i}.png`),
        ],
        { timeout: 15000, env: rendererEnv() },
      );
    const clip = clipSchema.parse({
      id,
      videoId: input.videoId,
      title: meta.title || "Untitled",
      channel: meta.channel || meta.uploader || "Not recorded",
      channelUrl: meta.channel_url || "",
      creator: meta.uploader || meta.channel || "Not recorded",
      sourceUrl: url,
      sourceStart: input.startSeconds,
      sourceEnd: input.startSeconds + duration,
      duration,
      width: stream.width,
      height: stream.height,
      fps: 30,
      frameCount,
      license: meta.license || "Not reported; no reuse permission inferred",
      permissionStatus: "pending",
      retrievedAt: new Date().toISOString(),
      purpose: input.purpose,
      audio: "muted",
    });
    await fs.writeFile(
      path.join(dir, "clip.json"),
      JSON.stringify(clip, null, 2),
    );
    await fs.rm(source, { force: true });
    return clip;
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}
export function clipCredits(clips: VideoClip[]) {
  return clips
    .map((c) =>
      c.sourceType === "upload"
        ? `• ${c.title}\n  Source: User-uploaded file${c.originalFilename ? ` (${c.originalFilename})` : ""}\n  Excerpt: ${c.sourceStart.toFixed(2)}–${c.sourceEnd.toFixed(2)} seconds; audio muted\n  Rights: Supplied by the uploader; not independently verified.\n  Used to illustrate: ${c.purpose}`
        : `• ${c.title}\n  Creator/uploader: ${c.creator}\n  Channel: ${c.channel}${c.channelUrl ? ` — ${c.channelUrl}` : ""}\n  Video: ${c.sourceUrl}\n  Excerpt: ${c.sourceStart.toFixed(2)}–${c.sourceEnd.toFixed(2)} seconds; audio muted\n  Source-reported license: ${c.license}\n  Permission: pending. Credits do not imply permission.\n  Used to illustrate: ${c.purpose}`,
    )
    .join("\n\n");
}
