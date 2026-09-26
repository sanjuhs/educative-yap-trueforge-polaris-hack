import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateTokens,
  effectiveToolName,
  measureTurnUsage,
} from "../src/usage.js";
import { forgeTurnEvents } from "../src/trueforge.js";
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

test("attributes renders routed through TrueForge's deferred call_tool wrapper", () => {
  assert.equal(
    effectiveToolName({ function: { name: "render_design" } }),
    "render_design",
  );
  assert.equal(
    effectiveToolName({
      function: {
        name: "call_tool",
        arguments: JSON.stringify({
          mcp_server: "video",
          tool_name: "render_design",
          input: { design_id: "example" },
        }),
      },
    }),
    "render_design",
  );
  assert.equal(
    effectiveToolName({
      function: { name: "call_tool", arguments: "not json" },
    }),
    undefined,
  );
});

// Token-only fixture from the affected production turn. Compaction is included
// in aggregate metrics but absent from the eight persisted model messages.
const compactedTotals = {
  total_input_tokens: 331446,
  total_output_tokens: 27917,
  total_tokens: 359363,
  total_cache_read_tokens: 257817,
  total_cache_write_tokens: 73602,
  total_reasoning_tokens: 3245,
};
const compactedRows = [
  [39857, 84, 39113, 741],
  [39954, 738, 39854, 97],
  [43535, 167, 39951, 3581],
  [46224, 273, 43532, 2689],
  [46788, 7338, 46221, 564],
  [18126, 6571, 6001, 12122],
  [25025, 53, 18123, 6899],
  [25176, 110, 25022, 151],
].map(
  ([input_tokens, output_tokens, cache_read_tokens, cache_write_tokens]) => ({
    type: "model.message",
    thread_id: "main",
    usage: {
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_write_tokens,
    },
  }),
);
const reviewRow = {
  type: "tool.response",
  content: JSON.stringify({
    visionReview: {
      model: "gpt-6-astra",
      usage: {
        input_tokens: 7546,
        output_tokens: 1451,
        total_tokens: 8997,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 7543 },
        output_tokens_details: { reasoning_tokens: 1327 },
      },
    },
  }),
};

test("prices compaction from turn totals and adds external review exactly once", () => {
  const result = measureTurnUsage("gpt-6-astra", compactedTotals, [
    ...compactedRows,
    reviewRow,
  ]);
  // 30 ordinary input + 257817 cache-read + 81145 cache-write; 29368 output.
  const expected = (30 * 10 + 257817 + 81145 * 12.5 + 29368 * 50) / 1e6;
  assert.ok(Math.abs(result.modelEstimateUsd! - expected) < 1e-9);
  assert.equal(result.error, undefined);
  assert.equal(result.metrics.total_input_tokens, 338992);
  assert.equal(result.metrics.total_output_tokens, 29368);
  assert.equal(result.metrics.total_reasoning_tokens, 4572);
  assert.equal(result.modelCalls, 9);
  assert.equal(result.visionModelCalls, 1);
  assert.match(result.usageNote!, /compaction/);
  // Reconciliation does not mutate the provider totals or double-count reviews.
  assert.equal(compactedTotals.total_input_tokens, 331446);
  assert.deepEqual(
    measureTurnUsage("gpt-6-astra", compactedTotals, [
      ...compactedRows,
      reviewRow,
    ]),
    result,
  );
});

test("keeps missing, inconsistent, mixed-model and long-context usage unpriced", () => {
  const cases: [Record<string, number> | undefined, any[]][] = [
    [undefined, compactedRows],
    [compactedTotals, []],
    [{ ...compactedTotals, total_output_tokens: 10 }, compactedRows],
    [{ ...compactedTotals, total_cache_write_tokens: 400000 }, compactedRows],
    [compactedTotals, [{ ...compactedRows[0], usage: undefined }]],
    [
      compactedTotals,
      compactedRows.map((row) => ({ ...row, thread_id: "child" })),
    ],
    [
      compactedTotals,
      [
        ...compactedRows,
        {
          ...reviewRow,
          content: reviewRow.content.replace("gpt-6-astra", "gpt-6-sol"),
        },
      ],
    ],
    [{ ...compactedTotals, total_input_tokens: 500000 }, compactedRows],
    [
      { total_input_tokens: 128000, total_output_tokens: 1 },
      [
        {
          type: "model.message",
          thread_id: "main",
          usage: { input_tokens: 128000, output_tokens: 1 },
        },
      ],
    ],
  ];
  for (const [totals, rows] of cases) {
    const result = measureTurnUsage("gpt-6-astra", totals, rows);
    assert.equal(result.modelEstimateUsd, undefined);
    assert.ok(result.error);
  }
});

test("unchanged estimates for fully traced turns without compaction", () => {
  const rows = [compactedRows[0]];
  const result = measureTurnUsage(
    "gpt-6-astra",
    {
      total_input_tokens: 39857,
      total_output_tokens: 84,
      total_cache_read_tokens: 39113,
      total_cache_write_tokens: 741,
    },
    rows,
  );
  assert.equal(
    result.modelEstimateUsd,
    estimateTokens("gpt-6-astra", 39857, 84, 39113, 741)!.usd,
  );
  assert.equal(result.usageNote, undefined);
});

test("reads nested pagination to retain a render response after 100 events", async () => {
  const render = {
    type: "tool.response",
    tool_call_id: "render",
    content: '{"id":"project","projectUrl":"/project"}',
  };
  const paths: string[] = [];
  const rows = await forgeTurnEvents("session", "turn", async (endpoint) => {
    paths.push(endpoint);
    return paths.length === 1
      ? {
          data: Array.from({ length: 100 }, (_, id) => ({ event: { id } })),
          pagination: { next_page_token: "cursor+/=" },
        }
      : { data: [render], pagination: { limit: 100 } };
  });
  assert.equal(rows.length, 101);
  assert.deepEqual(rows[100], render);
  assert.match(paths[1], /page_token=cursor%2B%2F%3D$/);
  await assert.rejects(
    forgeTurnEvents("session", "turn", async () => ({
      data: [],
      pagination: { next_page_token: "repeat" },
    })),
    /repeated/,
  );
});
