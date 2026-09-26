import test from "node:test";
import assert from "node:assert/strict";
import { estimateTokens } from "../src/usage.js";
import { planSchema } from "../src/schema.js";

test("prices cached tokens once and includes reasoning within output tokens", () => {
  const estimate = estimateTokens("gpt-6-astra", 10000, 2000, 4000)!;
  assert.ok(Math.abs(estimate.usd - 0.164) < 1e-9);
  assert.ok(Math.abs(estimate.cacheDiscountUsd - 0.036) < 1e-9);
  assert.equal(estimateTokens("unknown-model", 10000, 2000, 0), undefined);
  assert.equal(estimateTokens("gpt-6-astra", 100, 200, 101), undefined);
});
test("rejects incomplete image and web visual specifications", () => {
  for (const visual of ["web", "photo"]) {
    const plan = {
      title: "Test",
      summary: "Test",
      scenes: Array.from({ length: 3 }, () => ({
        title: "Demo",
        narration: "Test the demonstration.",
        visual,
        labels: ["test"],
      })),
    };
    assert.equal(planSchema.safeParse(plan).success, false);
  }
});

test("accounts for cache-write premiums separately from cache-read discounts", () => {
  const e = estimateTokens("gpt-6-astra", 8952, 1649, 3085, 5861)!;
  assert.ok(Math.abs(e.usd - 0.1588575) < 1e-9);
  assert.ok(Math.abs(e.cacheDiscountUsd - 0.0131125) < 1e-9);
  assert.equal(estimateTokens("gpt-5.4", 100, 200, 0, 50), undefined);
  assert.equal(estimateTokens("gpt-6-astra", 100, 200, 50, 51), undefined);
});
