import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMedia,
  presenterTimeline,
  type PresenterAsset,
} from "../src/presenter.js";
import { planSchema } from "../src/schema.js";
import { composition } from "../src/composition.js";
const asset: PresenterAsset = {
  id: "12345678-1234-4234-8234-123456789012",
  duration: 12,
  audioSource: "video",
  transcript: "My original words",
  segments: [],
  captions: [{ start: 1, end: 2, text: "My original words" }],
};
const plan = planSchema.parse({
  presenterAssetId: asset.id,
  title: "Test",
  summary: "Test presenter timing",
  scenes: [0, 4, 8].map((startSeconds) => ({
    startSeconds,
    title: "A visual",
    narration: "These are planning notes",
    visual: "statement",
    labels: ["One idea"],
  })),
});
test("uses recording timestamps without synthetic narration or extra gaps", () => {
  const scenes = presenterTimeline(plan, asset);
  assert.deepEqual(
    scenes.map((s) => [s.start, s.duration, s.audio]),
    [
      [0, 4, ""],
      [4, 4, ""],
      [8, 4, ""],
    ],
  );
  const html = composition(plan, scenes, 12, asset.captions);
  assert.ok(html.includes("My original words"));
  assert.ok(!html.includes("<audio"));
  assert.ok(!html.includes("These are planning notes"));
});
test("rejects missing, reversed and out-of-range scene timing", () => {
  for (const starts of [
    [undefined, 4, 8],
    [1, 4, 8],
    [0, 8, 4],
    [0, 4, 12],
  ])
    assert.throws(() =>
      presenterTimeline(
        {
          ...plan,
          scenes: plan.scenes.map((s, i) => ({
            ...s,
            startSeconds: starts[i],
          })),
        },
        asset,
      ),
    );
});
test("validates actual media streams, duration, and separate voiceover alignment", () => {
  const video = {
    format: { duration: 12 },
    streams: [{ codec_type: "video" }, { codec_type: "audio" }],
  };
  assert.equal(validateMedia(video, video, false), 12);
  assert.throws(() =>
    validateMedia({ ...video, format: { duration: 61 } }, video, false),
  );
  assert.throws(() => validateMedia(video, { streams: [] }, false));
  assert.throws(() =>
    validateMedia(
      video,
      { format: { duration: 9 }, streams: [{ codec_type: "audio" }] },
      true,
    ),
  );
});
