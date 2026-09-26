import { hosted, currentOwner, enqueueRender } from "./hosted/integrations.js";
import { renderAuthoredRemote } from "./modal-render.js";
import { prepareNarration } from "./narration-timing.js";
import { durationRange, MAX_VIDEO_SECONDS, renderTimeout } from "./duration.js";
import { readClip, clipCredits } from "./video-clips.js";
import { compositeCutout } from "./cutout.js";
import { readVisualAsset, visualAssetPath } from "./visual-assets.js";
import { authoredHtml } from "./render-browser.js";
import { projectUsage } from "./usage.js";
import {
  getPresenter,
  presenterTimeline,
  combinePresenter,
} from "./presenter.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { config, publicStudioUrl } from "./config.js";
import { composition } from "./composition.js";
import {
  planSchema,
  type Plan,
  type Project,
  type TimedScene,
} from "./schema.js";
import { probe, run, rendererEnv } from "./process.js";
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
  if (hosted) {
    const owner = currentOwner();
    if (!owner)
      throw new Error("Project persistence requires an authenticated owner");
    await hosted.store.saveProject(owner, project.id, project);
    if (project.status === "complete") {
      const files: Record<string, string> = {};
      const types: Record<string, string> = {
        "video.mp4": "video/mp4",
        "poster.jpg": "image/jpeg",
        "storyboard.json": "application/json",
        "probe.json": "application/json",
        "sources.json": "application/json",
        "clip-sources.json": "application/json",
        "credits.txt": "text/plain",
        "index.html": "text/html",
        "project.json": "application/json",
      };
      for (const [name, contentType] of Object.entries(types)) {
        const file = path.join(projectDir(project.id), name);
        if (!(await fs.stat(file).catch(() => null))?.isFile()) continue;
        files[name] = await hosted.storage.putFile(
          owner,
          project.id,
          name,
          file,
          contentType,
        );
      }
      await hosted.store.own(owner, "project", project.id, { files });
      await hosted.store.saveVersion(owner, project.id, 1, project);
    }
  }
}
export async function restoreProjects() {
  await fs.mkdir(config.projects, { recursive: true });
  if (hosted) {
    const stored = await hosted.pool.query<{ payload: Project }>(
      "SELECT payload FROM yap_projects ORDER BY created_at",
    );
    for (const { payload } of stored.rows) jobs.set(payload.id, payload);
  }
  for (const name of await fs.readdir(config.projects)) {
    if (!/^[a-f0-9-]{36}$/.test(name)) continue;
    try {
      const p = JSON.parse(
        await fs.readFile(path.join(projectDir(name), "project.json"), "utf8"),
      ) as Project;
      if (hosted && jobs.has(p.id)) continue; // Postgres is authoritative; disk is a working cache.
      if (!config.hosted && !["complete", "failed"].includes(p.status)) {
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
    usage: projectUsage(p),
    creditsText: clipCredits(p.footage || []),
    clipSourcesUrl: p.footage?.length
      ? `${publicStudioUrl}/media/${p.id}/clip-sources.json`
      : undefined,
    creditsUrl: p.footage?.length
      ? `${publicStudioUrl}/media/${p.id}/credits.txt`
      : undefined,
    sourcesUrl: p.plan.visualAssetIds?.length
      ? `${publicStudioUrl}/media/${p.id}/sources.json`
      : undefined,
    videoUrl:
      p.status === "complete"
        ? `${publicStudioUrl}/media/${p.id}/video.mp4`
        : undefined,
    projectUrl: `${publicStudioUrl}/?project=${p.id}`,
    sourceUrl: p.scenes
      ? `${publicStudioUrl}/media/${p.id}/index.html`
      : undefined,
  };
}
export async function createProject(input: Plan) {
  const plan = planSchema.parse(input);
  if (hosted) {
    const owner = currentOwner();
    if (!owner) throw new Error("An authenticated owner is required");
    if (!plan.motion)
      throw new Error(
        "Hosted generation requires an authored motion design for isolated rendering",
      );
    for (const id of plan.clipAssetIds || [])
      await hosted.store.assertOwn(owner, "clip", id);
    for (const id of plan.visualAssetIds || [])
      await hosted.store.assertOwn(owner, "image", id);
    if (plan.presenterAssetId)
      await hosted.store.assertOwn(owner, "presenter", plan.presenterAssetId);
  }
  const footage = await Promise.all((plan.clipAssetIds || []).map(readClip));
  if (footage.length && !plan.motion)
    throw new Error("Footage requires an authored motion design.");
  const visualAssets = await Promise.all(
    (plan.visualAssetIds || []).map(readVisualAsset),
  );
  if (plan.presenterAssetId)
    presenterTimeline(plan, await getPresenter(plan.presenterAssetId));
  if (
    !config.hosted &&
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
    footage,
  };
  await save(project);
  if (footage.length) {
    await fs.writeFile(
      path.join(projectDir(project.id), "clip-sources.json"),
      JSON.stringify(
        {
          clips: footage,
          note: "Review each asset’s permissionStatus. Source metadata does not verify rights ownership or historical identity.",
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(projectDir(project.id), "credits.txt"),
      "FOOTAGE CREDITS — DRAFT / REVIEW SOURCE RIGHTS\n\n" +
        clipCredits(footage),
    );
  }
  if (visualAssets.length) {
    await fs.writeFile(
      path.join(projectDir(project.id), "sources.json"),
      JSON.stringify(
        {
          purpose:
            "Creative preview; source permissions have not been independently reviewed",
          assets: visualAssets,
        },
        null,
        2,
      ),
    );
    await Promise.all(
      visualAssets.map((a) =>
        fs.copyFile(
          visualAssetPath(a.id),
          path.join(projectDir(project.id), `visual-${a.id}`),
        ),
      ),
    );
  }
  if (hosted) await enqueueRender(project.id);
  else
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
export async function renderProject(p: Project) {
  if (config.hosted && !p.plan.motion)
    throw new Error("Hosted renderer requires an isolated authored design");
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
  p.audioModel = presenter ? "whisper-1" : config.ttsModel;
  const scenes: TimedScene[] = presenter
    ? presenterTimeline(p.plan, presenter)
    : [];
  let cursor = presenter?.duration || 0;
  if (!presenter)
    for (const [i, s] of p.plan.scenes.entries()) {
      p.progress = `Recording narration ${i + 1}/${p.plan.scenes.length}`;
      await save(p);
      const audio = `voice-${i}.wav`;
      let cached = false;
      try {
        cached =
          Number((await probe(path.join(dir, audio))).format.duration) > 0;
      } catch {
        /* First attempt or interrupted audio write. */
      }
      if (!cached) {
        const response = await client.audio.speech.create({
          model: config.ttsModel,
          voice: p.plan.voice,
          input: s.narration,
          instructions:
            "Warm, curious science explainer. Conversational, crisp, energetic, never salesy. Brisk pace with clear emphasis. No extra words.",
          response_format: "wav",
        });
        await fs.writeFile(
          path.join(dir, audio),
          Buffer.from(await response.arrayBuffer()),
        );
      }
      const meta = await probe(path.join(dir, audio));
      const duration = Number(meta.format.duration) + 0.25;
      scenes.push({ ...s, start: cursor, duration, audio });
      cursor += duration;
    }
  if (!presenter) {
    const target = p.plan.creativeBrief?.targetDurationSeconds;
    const timed = await prepareNarration(dir, scenes, target);
    cursor = timed.duration;
    p.narrationSeconds = timed.sourceSeconds;
    p.narrationTempo = timed.tempo;
    if (target !== undefined) {
      const range = durationRange(target);
      if (cursor < range.min || cursor > range.max)
        throw new Error(
          `Narration is ${cursor.toFixed(1)}s outside the ${target}s target ±6s. Revise the script.`,
        );
    }
  }
  if (cursor > MAX_VIDEO_SECONDS + 6)
    throw new Error(
      "Narration exceeds the 20-minute target plus 6-second tolerance. Shorten the script.",
    );
  p.scenes = scenes;
  p.duration = cursor;
  await fs.copyFile(
    path.join(config.root, "node_modules/gsap/dist/gsap.min.js"),
    path.join(dir, "gsap.min.js"),
  );
  if (p.plan.motion || scenes.some((s) => ["web", "photo"].includes(s.visual)))
    await fs.copyFile(
      path.join(config.root, "assets/cafe.png"),
      path.join(dir, "cafe.png"),
    );
  await fs.writeFile(
    path.join(dir, "index.html"),
    p.plan.motion
      ? authoredHtml({
          plan: p.plan,
          scenes,
          duration: cursor,
          captions: presenter?.captions || [],
        })
      : composition(p.plan, scenes, cursor, presenter?.captions),
  );
  await fs.writeFile(
    path.join(dir, "storyboard.json"),
    JSON.stringify(p.plan, null, 2),
  );
  p.status = "rendering";
  p.progress = "Rendering animated scenes with HyperFrames";
  await save(p);
  const safeEnv = rendererEnv();
  if (p.plan.motion) {
    const captions =
      presenter?.captions ||
      scenes.flatMap((s) => {
        const words = s.narration.split(/\s+/);
        const chunks = [];
        for (let i = 0; i < words.length; i += 7)
          chunks.push(words.slice(i, i + 7).join(" "));
        return chunks.map((text, i) => ({
          text,
          start: s.start + (i * (s.duration - 0.25)) / chunks.length,
          end: s.start + ((i + 1) * (s.duration - 0.25)) / chunks.length,
        }));
      });
    await fs.writeFile(
      path.join(dir, "render-input.json"),
      JSON.stringify({
        plan: p.plan,
        scenes,
        duration: cursor,
        captions: presenter && p.plan.presenterMode !== "split" ? [] : captions,
      }),
    );
    p.progress = "Rendering your director’s original animation";
    await save(p);
    const onOutput = (text: string) => {
      void fs.appendFile(path.join(dir, "render.log"), text).catch(() => {});
    };
    if (config.hosted)
      await renderAuthoredRemote(dir, {
        timeoutMs: Math.max(renderTimeout(cursor), cursor * 6000 + 180000),
        onOutput,
      });
    else
      await run(
        process.execPath,
        [
          "--import",
          "tsx",
          path.join(config.root, "src/authored-worker.ts"),
          dir,
        ],
        { timeout: renderTimeout(cursor), env: safeEnv, onOutput },
      );
    if (!presenter) {
      await run("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        path.join(dir, "render.mp4"),
        "-i",
        path.join(dir, "narration.wav"),
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-t",
        String(cursor),
        path.join(dir, "narrated.mp4"),
      ]);
      await fs.rename(
        path.join(dir, "narrated.mp4"),
        path.join(dir, "render.mp4"),
      );
    }
  } else {
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
        timeout: renderTimeout(cursor),
        env: safeEnv,
        onOutput: (text) => {
          void fs
            .appendFile(path.join(dir, "render.log"), text)
            .catch(() => {});
        },
      },
    );
  }
  let narratedFile = path.join(dir, "render.mp4");
  if (presenter) {
    p.progress = "Combining your recording with the explainer visuals";
    await save(p);
    if (p.plan.motion && p.plan.presenterMode !== "split") {
      p.progress =
        "Removing your background locally and compositing the presenter";
      await save(p);
      await compositeCutout(dir, presenter, p.plan, (text) => {
        void fs.appendFile(path.join(dir, "render.log"), text).catch(() => {});
      });
    } else await combinePresenter(dir, presenter);
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
