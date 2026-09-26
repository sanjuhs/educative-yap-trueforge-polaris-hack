import fs from "node:fs/promises";
import path from "node:path";
import { probe, run } from "./process.js";
import { narrationTempo, SCENE_PAUSE } from "./duration.js";
import type { TimedScene } from "./schema.js";

// Prepare identical-rate audio sequentially, then concat instead of opening hundreds of inputs.
export async function prepareNarration(
  dir: string,
  scenes: TimedScene[],
  target?: number,
) {
  const rawDurations = scenes.map((s) => s.duration - SCENE_PAUSE);
  const tempo = narrationTempo(rawDurations, target);
  let cursor = 0;
  const files: string[] = [];
  for (const [i, scene] of scenes.entries()) {
    const file = `timed-${i}.wav`;
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      path.join(dir, scene.audio),
      "-af",
      `atempo=${tempo},apad=pad_dur=${SCENE_PAUSE}`,
      "-ar",
      "24000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      path.join(dir, file),
    ]);
    const duration = Number(
      (await probe(path.join(dir, file))).format.duration,
    );
    scene.start = cursor;
    scene.duration = duration;
    scene.audio = file;
    cursor += duration;
    files.push(`file '${file}'`);
  }
  await fs.writeFile(
    path.join(dir, "narration-list.txt"),
    files.join("\n") + "\n",
  );
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "1",
    "-i",
    path.join(dir, "narration-list.txt"),
    "-c:a",
    "pcm_s16le",
    path.join(dir, "narration.wav"),
  ]);
  return {
    duration: cursor,
    tempo,
    sourceSeconds: rawDurations.reduce((a, b) => a + b, 0),
  };
}
