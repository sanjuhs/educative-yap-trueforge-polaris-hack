import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { config } from "./config.js";
import { probe, run } from "./process.js";
import type { Plan, TimedScene } from "./schema.js";
export type Caption = { text: string; start: number; end: number };
export type PresenterAsset = {
  id: string;
  duration: number;
  audioSource: "video" | "voiceover";
  transcript: string;
  segments: Caption[];
  captions: Caption[];
};
export function presenterDir(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new Error("Invalid presenter recording ID");
  return path.join(config.data, "presenters", id);
}
export async function getPresenter(id: string): Promise<PresenterAsset> {
  return JSON.parse(
    await fs.readFile(path.join(presenterDir(id), "asset.json"), "utf8"),
  );
}
export function validateMedia(video: any, audio: any, separate: boolean) {
  const duration = Number(video.format?.duration);
  if (!video.streams?.some((s: any) => s.codec_type === "video"))
    throw new Error("Please upload a playable video file.");
  if (!Number.isFinite(duration) || duration < 3 || duration > 60)
    throw new Error("Presenter videos must be between 3 and 60 seconds long.");
  if (!audio.streams?.some((s: any) => s.codec_type === "audio"))
    throw new Error("This video has no audio. Add a separate voiceover file.");
  if (separate && Math.abs(Number(audio.format?.duration) - duration) > 0.75)
    throw new Error(
      "The separate voiceover must match the video duration (within 0.75 seconds) and start at the same moment. Trim or align it before uploading.",
    );
  return duration;
}
export async function preparePresenter(
  videoFile: string,
  voiceFile?: string,
): Promise<PresenterAsset> {
  const video = await probe(videoFile),
    audio = voiceFile ? await probe(voiceFile) : video;
  const duration = validateMedia(video, audio, !!voiceFile);
  const id = randomUUID(),
    dir = presenterDir(id);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.copyFile(videoFile, path.join(dir, "original-video"));
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      voiceFile || videoFile,
      "-vn",
      "-t",
      String(duration),
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      path.join(dir, "transcription.wav"),
    ]);
    // Retain the original recording's audio at full quality for the finished video.
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      voiceFile || videoFile,
      "-vn",
      "-t",
      String(duration),
      "-af",
      "apad",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      path.join(dir, "voice.wav"),
    ]);
    const client = new OpenAI({
      apiKey: config.apiKey,
      timeout: 120000,
      maxRetries: 1,
    });
    const transcript = await client.audio.transcriptions.create({
      file: createReadStream(path.join(dir, "transcription.wav")),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });
    if (!transcript.text?.trim())
      throw new Error(
        "No speech was detected. Please upload a recording with clear narration.",
      );
    const segments = (transcript.segments || [])
      .map((s) => ({
        text: s.text.trim(),
        start: s.start,
        end: Math.min(duration, s.end),
      }))
      .filter((s) => s.end > s.start);
    const words = transcript.words || [];
    const captions: Caption[] = [];
    for (let i = 0; i < words.length; i += 6) {
      const group = words.slice(i, i + 6);
      const start = group[0].start,
        end = Math.min(duration, group.at(-1)!.end);
      if (end > start)
        captions.push({ text: group.map((w) => w.word).join(" "), start, end });
    }
    if (!captions.length) captions.push(...segments);
    const asset: PresenterAsset = {
      id,
      duration,
      audioSource: voiceFile ? "voiceover" : "video",
      transcript: transcript.text,
      segments,
      captions,
    };
    await fs.writeFile(
      path.join(dir, "asset.json"),
      JSON.stringify(asset, null, 2),
    );
    return asset;
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true });
    throw err;
  }
}
export function presenterTimeline(
  plan: Plan,
  asset: PresenterAsset,
): TimedScene[] {
  const starts = plan.scenes.map((s) => s.startSeconds);
  if (
    starts[0] !== 0 ||
    starts.some(
      (s, i) =>
        s === undefined ||
        s < 0 ||
        s >= asset.duration ||
        (i > 0 && s - starts[i - 1]! < 1),
    )
  )
    throw new Error(
      "Presenter scenes need startSeconds: first scene at 0, then increasing timestamps at least 1 second apart, within the recording.",
    );
  return plan.scenes.map((s, i) => ({
    ...s,
    start: starts[i]!,
    duration: (starts[i + 1] ?? asset.duration) - starts[i]!,
    audio: "",
  }));
}
export async function combinePresenter(dir: string, asset: PresenterAsset) {
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    path.join(dir, "render.mp4"),
    "-i",
    path.join(presenterDir(asset.id), "original-video"),
    "-i",
    path.join(presenterDir(asset.id), "voice.wav"),
    "-filter_complex",
    "[0:v]crop=1080:1080:0:0,setsar=1,setpts=PTS-STARTPTS[top];[1:v]scale=1080:840:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:840:(ow-iw)/2:(oh-ih)/2:color=0x121718,setsar=1,fps=30,setpts=PTS-STARTPTS[bottom];[top][bottom]vstack=inputs=2[v]",
    "-map",
    "[v]",
    "-map",
    "2:a:0",
    "-t",
    String(asset.duration),
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    path.join(dir, "presenter.mp4"),
  ]);
}
