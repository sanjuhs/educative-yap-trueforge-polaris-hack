import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { creativeBriefSchema } from "../src/creative-brief.js";
import {
  targetDurationSchema,
  narrationTempo,
  estimatedTimeline,
  renderTimeout,
  durationRange,
} from "../src/duration.js";
import { authoredPlan } from "../src/authored.js";
import { prepareNarration } from "../src/narration-timing.js";
import { probe, run } from "../src/process.js";
import { launchRenderer, openAuthoredPage } from "../src/render-browser.js";
const motion = {
  html: '<canvas id="stage" width="1080" height="1920"></canvas>',
  css: "",
  javascript:
    'window.renderFrame=(t,d,scenes)=>{const c=document.querySelector("canvas").getContext("2d");c.fillStyle="#14252d";c.fillRect(0,0,1080,1920);c.fillStyle="coral";c.fillRect((t%10)*80,600,100,100);};',
};

test("duration boundary and step validation includes 5s through 20min", () => {
  for (const seconds of [5, 10, 30, 65, 600, 1200])
    assert.equal(targetDurationSchema.parse(seconds), seconds);
  for (const seconds of [0, 4, 6, 30.5, 1205, NaN, Infinity])
    assert.equal(targetDurationSchema.safeParse(seconds).success, false);
  assert.deepEqual(durationRange(5), { min: 1, max: 11 });
  assert.equal(creativeBriefSchema.parse({}).targetDurationSeconds, undefined);
});
test("audio fitting respects tolerance and never stretches a short script into a long video", () => {
  assert.equal(narrationTempo([29.75], 30), 1);
  assert.equal(narrationTempo([35.75], 30), 1);
  assert.ok(narrationTempo([109.75], 100) > 1);
  assert.ok(narrationTempo([91.75], 100) < 1);
  assert.throws(() => narrationTempo([20], 1200), /Expand/);
  assert.throws(() => narrationTempo([100], 10), /Shorten/);
});
test("a substantial 20-minute storyboard is accepted and supports end-of-timeline seeking", async () => {
  const plan = authoredPlan({
    title: "Long explainer",
    summary: "Chapters",
    presenterMode: "cutout",
    voice: "marin",
    music: false,
    creativeBrief: creativeBriefSchema.parse({ targetDurationSeconds: 1200 }),
    scenes: Array.from({ length: 100 }, (_, i) => ({
      title: `Beat ${i}`,
      narration: "word ".repeat(25).trim(),
    })),
    motion,
  });
  const scenes = estimatedTimeline(plan.scenes, 1200);
  assert.ok(
    Math.abs(scenes.at(-1)!.start + scenes.at(-1)!.duration - 1200) < 1e-8,
  );
  assert.ok(renderTimeout(1200) >= 7200000);
  const browser = await launchRenderer();
  try {
    const r = await openAuthoredPage(browser, {
      plan,
      scenes,
      duration: 1200,
      captions: [],
    });
    await r.seek(1199);
    const last = await r.page.screenshot();
    await r.seek(3);
    assert.notDeepEqual(await r.page.screenshot(), last);
    await r.seek(1199);
    assert.deepEqual(await r.page.screenshot(), last);
  } finally {
    await browser.close();
  }
});
test("audio concat and bounded tempo correction preserve timeline and audible streams", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yap-duration-"));
  try {
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=24000:duration=53",
      "-c:a",
      "pcm_s16le",
      path.join(dir, "voice.wav"),
    ]);
    const plan = authoredPlan({
      title: "Test",
      summary: "Timing",
      presenterMode: "cutout",
      voice: "marin",
      music: false,
      scenes: [{ title: "One", narration: "One test sentence." }],
      motion,
    });
    const scenes = [0, 1].map((i) => ({
      ...plan.scenes[0],
      start: i * 53.25,
      duration: 53.25,
      audio: "voice.wav",
    }));
    const result = await prepareNarration(dir, scenes, 100);
    assert.ok(Math.abs(result.duration - 100) < 0.2);
    assert.equal(result.sourceSeconds, 106);
    assert.ok(result.tempo > 1 && result.tempo < 1.18);
    assert.equal(scenes[1].start, scenes[0].duration);
    const metadata = await probe(path.join(dir, "narration.wav"));
    assert.ok(
      Math.abs(Number(metadata.format.duration) - result.duration) < 0.01,
    );
    assert.equal(metadata.streams[0].codec_type, "audio");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
