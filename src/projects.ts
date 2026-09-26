import {
  getPresenter,
  presenterTimeline,
  combinePresenter,
} from "./presenter.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { config, studioUrl } from "./config.js";
import { composition } from "./composition.js";
import {
  planSchema,
  type Plan,
  type Project,
  type TimedScene,
} from "./schema.js";
import { probe, run } from "./process.js";
const jobs = new Map<string, Project>();
let queue = Promise.resolve();
export function projectDir(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid project ID");
  return path.join(config.projects, id);
}
export async function save(project: Project) {
  await fs.mkdir(projectDir(project.id), { recursive: true });
  const target = path.join(projectDir(project.id), "project.json");
  await fs.writeFile(target + ".tmp", JSON.stringify(project, null, 2));
  await fs.rename(target + ".tmp", target);
  jobs.set(project.id, project);
}
export async function restoreProjects() {
  await fs.mkdir(config.projects, { recursive: true });
  for (const name of await fs.readdir(config.projects)) {
    if (!/^[a-f0-9-]{36}$/.test(name)) continue;
    try {
      const p = JSON.parse(
        await fs.readFile(path.join(projectDir(name), "project.json"), "utf8"),
      ) as Project;
      if (!["complete", "failed"].includes(p.status)) {
        p.status = "failed";
        p.error =
          "The app stopped before this render completed. Create a new version to retry.";
        p.progress = "Interrupted";
        await save(p);
      } else jobs.set(p.id, p);
    } catch {
      console.warn(`Skipping unreadable project ${name}`);
    }
  }
}
export function listProjects() {
  return [...jobs.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
export function getProject(id: string) {
  const p = jobs.get(id);
  if (!p) throw new Error("Project not found");
  return p;
}
export function publicProject(p: Project) {
  return {
    ...p,
    videoUrl:
      p.status === "complete"
        ? `${studioUrl}/media/${p.id}/video.mp4`
        : undefined,
    projectUrl: `${studioUrl}/?project=${p.id}`,
    sourceUrl: p.scenes ? `${studioUrl}/media/${p.id}/index.html` : undefined,
  };
}
export async function createProject(input: Plan) {
  const plan = planSchema.parse(input);
  if (plan.presenterAssetId)
    presenterTimeline(plan, await getPresenter(plan.presenterAssetId));
  if (
    listProjects().filter((p) => !["complete", "failed"].includes(p.status))
      .length >= 3
  )
    throw new Error(
      "Render queue is full. Wait for an existing video to finish.",
    );
  const project: Project = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "queued",
    progress: "Queued for narration",
    plan,
  };
  await save(project);
  queue = queue
    .then(() => renderProject(project))
    .catch(async (err) => {
      project.status = "failed";
      project.error = String(err.message || err).replaceAll(
        config.apiKey || "__no_key__",
        "[redacted]",
      );
      project.progress = "Render failed";
      await save(project);
    });
  return publicProject(project);
}
function ambient(duration: number) {
  const rate = 24000,
    length = Math.ceil(rate * duration),
    bytes = Buffer.alloc(44 + length * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + length * 2, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(length * 2, 40);
  const chords = [
    [130.81, 164.81, 196],
    [110, 130.81, 164.81],
    [87.31, 110, 130.81],
    [98, 123.47, 146.83],
  ];
  for (let i = 0; i < length; i++) {
    const t = i / rate,
      chord = chords[Math.floor(t / 4) % 4];
    const fade = Math.min(1, t / 1.5, (duration - t) / 2);
    const sound =
      chord.reduce((s, f) => s + Math.sin(2 * Math.PI * f * t) * 0.1, 0) +
      Math.sin(2 * Math.PI * chord[Math.floor(t * 2) % 3] * 2 * t) *
        0.05 *
        Math.exp(-(t % 0.5) * 6);
    bytes.writeInt16LE(Math.round(sound * fade * 32767 * 0.2), 44 + i * 2);
  }
  return bytes;
}
async function renderProject(p: Project) {
  const dir = projectDir(p.id),
    client = new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 2,
      timeout: 90000,
    });
  p.status = "narrating";
  await save(p);
  const presenter = p.plan.presenterAssetId
    ? await getPresenter(p.plan.presenterAssetId)
    : undefined;
  const scenes: TimedScene[] = presenter
    ? presenterTimeline(p.plan, presenter)
    : [];
  let cursor = presenter?.duration || 0;
  if (!presenter)
    for (const [i, s] of p.plan.scenes.entries()) {
      p.progress = `Recording narration ${i + 1}/${p.plan.scenes.length}`;
      await save(p);
      const response = await client.audio.speech.create({
        model: config.ttsModel,
        voice: p.plan.voice,
        input: s.narration,
        instructions:
          "Warm, curious science explainer. Conversational, crisp, energetic, never salesy. Brisk pace with clear emphasis. No extra words.",
        response_format: "wav",
      });
      const audio = `voice-${i}.wav`;
      await fs.writeFile(
        path.join(dir, audio),
        Buffer.from(await response.arrayBuffer()),
      );
      const meta = await probe(path.join(dir, audio));
      const duration = Number(meta.format.duration) + 0.25;
      scenes.push({ ...s, start: cursor, duration, audio });
      cursor += duration;
    }
  if (cursor > 60)
    throw new Error(
      `Narration is ${cursor.toFixed(1)} seconds. Shorten the script and create a new version (maximum 60 seconds).`,
    );
  p.scenes = scenes;
  p.duration = cursor;
  await fs.copyFile(
    path.join(config.root, "node_modules/gsap/dist/gsap.min.js"),
    path.join(dir, "gsap.min.js"),
  );
  await fs.writeFile(
    path.join(dir, "index.html"),
    composition(p.plan, scenes, cursor, presenter?.captions),
  );
  await fs.writeFile(
    path.join(dir, "storyboard.json"),
    JSON.stringify(p.plan, null, 2),
  );
  p.status = "rendering";
  p.progress = "Rendering animated scenes with HyperFrames";
  await save(p);
  const safeEnv = { ...process.env };
  for (const key of Object.keys(safeEnv)) {
    if (/KEY|SECRET|TOKEN|PASSWORD/.test(key)) delete safeEnv[key];
  }
  await run(
    process.execPath,
    [
      path.join(config.root, "node_modules/hyperframes/bin/hyperframes.mjs"),
      "render",
      dir,
      "--output",
      path.join(dir, "render.mp4"),
      "--workers",
      "2",
      "--quality",
      "standard",
    ],
    {
      timeout: 900000,
      env: safeEnv,
      onOutput: (text) => {
        void fs.appendFile(path.join(dir, "render.log"), text).catch(() => {});
      },
    },
  );
  let narratedFile = path.join(dir, "render.mp4");
  if (presenter) {
    p.progress = "Combining your recording with the explainer visuals";
    await save(p);
    await combinePresenter(dir, presenter);
    narratedFile = path.join(dir, "presenter.mp4");
  }
  if (p.plan.music) {
    p.progress = "Mixing narration with an original ambient soundtrack";
    await save(p);
    await fs.writeFile(path.join(dir, "music.wav"), ambient(cursor));
    await run("ffmpeg", [
      "-y",
      "-i",
      narratedFile,
      "-i",
      path.join(dir, "music.wav"),
      "-filter_complex",
      "[0:a]asplit=2[voice][side];[1:a][side]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=250[bed];[voice][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]",
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      path.join(dir, "video.mp4"),
    ]);
  } else await fs.copyFile(narratedFile, path.join(dir, "video.mp4"));
  const meta = await probe(path.join(dir, "video.mp4"));
  const video = meta.streams.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  if (
    video?.width !== 1080 ||
    video?.height !== 1920 ||
    !meta.streams.some((s: { codec_type: string }) => s.codec_type === "audio")
  )
    throw new Error(
      "Export validation failed: expected 1080×1920 video with audio.",
    );
  await fs.writeFile(
    path.join(dir, "probe.json"),
    JSON.stringify(meta, null, 2),
  );
  await run("ffmpeg", [
    "-y",
    "-ss",
    "1.5",
    "-i",
    path.join(dir, "video.mp4"),
    "-frames:v",
    "1",
    "-update",
    "1",
    path.join(dir, "poster.jpg"),
  ]);
  p.status = "complete";
  p.progress = "Ready to watch and download";
  await save(p);
}
