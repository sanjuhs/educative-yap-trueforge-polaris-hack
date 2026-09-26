import test from "node:test";
import assert from "node:assert/strict";
import {
  generationSchema,
  generationOptions,
  profileName,
} from "../src/model-options.js";
import { estimateTokens } from "../src/usage.js";

test("reprices a measured workload including cache writes for each selectable model", () => {
  // Actual HTML/CSS sample, including its final review. Counterfactual pricing, not quality parity.
  for (const [model, expected] of [
    ["gpt-6-astra", 2.138543],
    ["gpt-6-sol", 0.4277086],
    ["gpt-6-luna", 0.02138543],
  ] as const) {
    assert.ok(
      Math.abs(
        estimateTokens(model, 207585, 28905, 165343, 42212)!.usd - expected,
      ) < 1e-9,
    );
  }
});

test("rejects unsupported selections and isolates model/effort profiles", () => {
  assert.equal(
    generationSchema.safeParse({ model: "gpt-6-astra", reasoning: "none" })
      .success,
    false,
  );
  assert.equal(
    generationSchema.safeParse({ model: "arbitrary-model", reasoning: "high" })
      .success,
    false,
  );
  const profiles = generationOptions().models.flatMap((m) =>
    generationOptions().reasoning.map((reasoning) =>
      profileName(generationSchema.parse({ model: m.id, reasoning })),
    ),
  );
  assert.equal(new Set(profiles).size, 15);
});

test("budget scenarios are explicit and include cache-write premiums", () => {
  const options = generationOptions();
  assert.match(
    options.estimateBasis,
    /not measured model benchmarks or a spending cap/,
  );
  const luna = options.models.find((m) => m.id === "gpt-6-luna")!;
  assert.equal(luna.estimate.low, 0.0045);
  assert.equal(luna.estimate.high, 0.04);
  assert.equal(options.audio.presenter, 0.003);
});
