import test from "node:test";
import assert from "node:assert/strict";
import {
  creativeBriefSchema,
  creativeBriefMessage,
} from "../src/creative-brief.js";
import { authoredPlan } from "../src/authored.js";

test("validates visual controls and gives zero-photo requests explicit sourcing instructions", () => {
  const brief = creativeBriefSchema.parse({
    webImagePercent: 0,
    pacing: "brisk",
    notes: "Show a real browser layout.",
  });
  const message = creativeBriefMessage(brief);
  assert.match(message, /Do not search for or import internet images/);
  assert.match(message, /2–3 seconds/);
  assert.match(message, /Show a real browser layout/);
  assert.match(
    message,
    /Moving B-roll\/video imports are not currently supported/,
  );
  for (const value of [-1, 101, 50.5])
    assert.equal(
      creativeBriefSchema.safeParse({ webImagePercent: value }).success,
      false,
    );
  assert.equal(
    creativeBriefSchema.safeParse({ notes: "x".repeat(1501) }).success,
    false,
  );
});

test("keeps the brief and shot classification in exported plans without requiring templates", () => {
  const creativeBrief = creativeBriefSchema.parse({
    webImagePercent: 70,
    explanationType: "comparison",
  });
  const plan = authoredPlan({
    title: "Compare engines",
    summary: "Compare two mechanisms.",
    creativeBrief,
    voice: "marin",
    music: false,
    presenterMode: "cutout",
    scenes: [
      {
        title: "Two engines",
        narration: "Watch how the parts move.",
        shotKind: "mixed",
        visualIntent:
          "Photographs locate the parts; animated arrows show flow.",
      },
    ],
    motion: {
      html: "<canvas></canvas>",
      css: "",
      javascript: "window.renderFrame=()=>{}",
    },
  });
  assert.deepEqual(plan.creativeBrief, creativeBrief);
  assert.equal(plan.scenes[0].shotKind, "mixed");
  assert.match(creativeBriefMessage(creativeBrief), /soft editorial target/);
});
