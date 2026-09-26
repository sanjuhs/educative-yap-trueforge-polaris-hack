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
  assert.match(message, /autonomously search YouTube/i);
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

test("footage mix uses overall screen time and preserves legacy automatic briefs", () => {
  const brief = creativeBriefSchema.parse({
    webImagePercent: 30,
    footagePercent: 50,
    openingStyle: "clip-first",
  });
  const message = creativeBriefMessage(brief);
  assert.match(message, /30% photos, 50% footage, about 20% original/);
  assert.match(message, /search_saved_assets/);
  assert.match(message, /beginning/);
  assert.match(message, /not asset counts/);
  assert.equal(
    creativeBriefSchema.safeParse({ webImagePercent: 70, footagePercent: 40 })
      .success,
    false,
  );
  assert.equal(
    creativeBriefSchema.safeParse({ webImagePercent: 100 }).success,
    true,
  );
  assert.equal(
    creativeBriefSchema.safeParse({
      webImagePercent: 100,
      footage: "off",
      footagePercent: 50,
    }).success,
    true,
  );
  for (const footagePercent of [-1, 101, 10.5])
    assert.equal(
      creativeBriefSchema.safeParse({ footagePercent }).success,
      false,
    );
  assert.equal(
    creativeBriefSchema.safeParse({ openingStyle: "random" }).success,
    false,
  );
});

test("zero footage and disabled sourcing never prompt a clip search", () => {
  for (const controls of [
    { footagePercent: 0 },
    { footage: "off", footagePercent: 40 },
  ]) {
    const message = creativeBriefMessage(
      creativeBriefSchema.parse({ ...controls, openingStyle: "clip-first" }),
    );
    assert.match(message, /Do not search or import footage/);
    assert.doesNotMatch(message, /search_youtube_clips/);
    assert.match(message, /open with an original dynamic visual/);
    assert.match(message, /0% footage/);
  }
});
