import test from "node:test";
import assert from "node:assert/strict";
import { planSchema } from "../src/schema.js";
import { composition } from "../src/composition.js";
import { projectDir } from "../src/projects.js";
const scene = {
  title: "A <brighter> idea",
  narration: "A clear explanation works best with one concrete example.",
  visual: "statement",
  labels: ["One idea"],
  values: [],
  accent: "lime",
};
const plan = {
  title: "Test",
  summary: "A test storyboard",
  voice: "marin",
  music: false,
  scenes: [scene, scene, scene],
};
test("rejects incomplete bar charts and excessive narration", () => {
  assert.equal(
    planSchema.safeParse({
      ...plan,
      scenes: [{ ...scene, visual: "bars", values: [] }, scene, scene],
    }).success,
    false,
  );
  assert.equal(
    planSchema.safeParse({
      ...plan,
      scenes: Array(6).fill({ ...scene, narration: "word ".repeat(30) }),
    }).success,
    false,
  );
});
test("escapes user labels before embedding them into an executable scene", () => {
  const p = planSchema.parse(plan);
  const html = composition(
    p,
    p.scenes.map((s, i) => ({
      ...s,
      start: i * 5,
      duration: 5,
      audio: `voice-${i}.wav`,
    })),
    15,
  );
  assert.ok(html.includes("A &lt;brighter&gt; idea"));
  assert.ok(!html.includes("A <brighter> idea"));
});
test("rejects paths outside the projects directory", () => {
  assert.throws(() => projectDir("../../.env"));
});
