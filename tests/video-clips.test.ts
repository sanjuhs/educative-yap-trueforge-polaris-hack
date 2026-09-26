import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  clipDir,
  clipRequestSchema,
  clipCredits,
  type VideoClip,
} from "../src/video-clips.js";
import { authoredPlan } from "../src/authored.js";
import { launchRenderer, openAuthoredPage } from "../src/render-browser.js";
import { run } from "../src/process.js";

test("rejects arbitrary URLs, paths and oversized excerpt requests", () => {
  assert.throws(() => clipDir("../../.env"));
  for (const value of [
    {
      videoId: "https://localhost/",
      startSeconds: 0,
      durationSeconds: 4,
      purpose: "test",
    },
    {
      videoId: "CHehyGoOeOM",
      startSeconds: -1,
      durationSeconds: 4,
      purpose: "test",
    },
    {
      videoId: "CHehyGoOeOM",
      startSeconds: 0,
      durationSeconds: 60,
      purpose: "test",
    },
  ])
    assert.equal(clipRequestSchema.safeParse(value).success, false);
});

test("seeks footage deterministically, hides it outside its range, and preserves source credits", async () => {
  const id = randomUUID(),
    dir = clipDir(id);
  await fs.mkdir(dir, { recursive: true });
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x90:rate=30",
    "-t",
    "3",
    "-start_number",
    "0",
    path.join(dir, "frame-%03d.jpg"),
  ]);
  const clip: VideoClip = {
    id,
    videoId: "CHehyGoOeOM",
    title: "Test footage",
    channel: "Test channel",
    channelUrl: "https://www.youtube.com/@example",
    creator: "Test uploader",
    sourceUrl: "https://www.youtube.com/watch?v=CHehyGoOeOM",
    sourceStart: 12,
    sourceEnd: 15,
    duration: 3,
    width: 160,
    height: 90,
    fps: 30,
    frameCount: 90,
    permissionStatus: "pending",
    license: "Not reported",
    retrievedAt: new Date().toISOString(),
    purpose: "Test playback",
    audio: "muted",
  };
  await fs.writeFile(path.join(dir, "clip.json"), JSON.stringify(clip));
  const browser = await launchRenderer();
  try {
    const plan = authoredPlan({
      title: "Footage",
      summary: "Deterministic frames",
      voice: "marin",
      music: false,
      presenterMode: "cutout",
      clipAssetIds: [id],
      scenes: [
        { title: "Clip", narration: "A short clip.", shotKind: "b-roll" },
      ],
      motion: {
        html: `<img id="clip" data-clip-id="${id}" data-scene="0" data-offset="1">`,
        css: "#clip{width:500px;height:300px}",
        javascript: "window.renderFrame=()=>{}",
      },
    });
    const r = await openAuthoredPage(browser, {
      plan,
      scenes: [{ ...plan.scenes[0], start: 0, duration: 5, audio: "" }],
      duration: 5,
      captions: [],
    });
    await r.seek(1.2);
    const a = await r.page.screenshot();
    await r.seek(2.4);
    const b = await r.page.screenshot();
    await r.seek(1.2);
    const c = await r.page.screenshot();
    assert.deepEqual(a, c);
    assert.notDeepEqual(a, b);
    await r.seek(4.1);
    assert.equal(
      await r.page
        .locator("#clip")
        .evaluate((el) => getComputedStyle(el).visibility),
      "hidden",
    );
    assert.match(clipCredits([clip]), /Test channel/);
    assert.match(clipCredits([clip]), /12.00–15.00/);
    assert.match(clipCredits([clip]), /Permission: pending/);
    await assert.rejects(
      () =>
        openAuthoredPage(browser, {
          plan: { ...plan, clipAssetIds: [] },
          scenes: [{ ...plan.scenes[0], start: 0, duration: 5, audio: "" }],
          duration: 5,
          captions: [],
        }),
      /Declare every clip/,
    );
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
