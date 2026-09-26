import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { forgeRequest } from "./trueforge.js";
import type { Project } from "./schema.js";

import {
  tokenRates as rates,
  defaultGeneration,
  type GenerationSettings,
} from "./model-options.js";
type Run = {
  sessionId: string;
  turnId: string;
  model: string;
  reasoning: string;
  status: string;
  projectIds: string[];
  metrics?: Record<string, number>;
  modelCalls?: number;
  visionModelCalls?: number;
  modelEstimateUsd?: number;
  cacheDiscountUsd?: number;
  error?: string;
};
const runs = new Map<string, Run>();
const folder = path.join(config.data, "usage");
export function estimateTokens(
  model: string,
  input: number,
  output: number,
  cached: number,
  writes = 0,
) {
  const rate =
    rates[model] ||
    rates[Object.keys(rates).find((k) => model.startsWith(k + "-20")) || ""];
  if (
    !rate ||
    ![input, output, cached, writes].every(Number.isFinite) ||
    input < 0 ||
    output < 0 ||
    cached < 0 ||
    writes < 0 ||
    cached + writes > input ||
    (writes > 0 && rate.write === undefined)
  )
    return undefined;
  return {
    usd:
      ((input - cached - writes) * rate.input +
        writes * (rate.write || rate.input) +
        cached * rate.cached +
        output * rate.output) /
      1e6,
    cacheDiscountUsd:
      (cached * (rate.input - rate.cached) -
        writes * ((rate.write || rate.input) - rate.input)) /
      1e6,
  };
}
async function persist(r: Run) {
  runs.set(r.turnId, r);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(
    path.join(folder, r.turnId + ".json"),
    JSON.stringify(r, null, 2),
  );
}
export async function watchUsage(
  sessionId: string,
  turnId: string,
  settings: GenerationSettings = defaultGeneration(),
) {
  const r = runs.get(turnId) || {
    sessionId,
    turnId,
    model: settings.model,
    reasoning: settings.reasoning,
    status: "pending",
    projectIds: [],
  };
  await persist(r);
  void monitor(r);
}
async function monitor(r: Run) {
  try {
    const { data: turn } = await forgeRequest(
      `/sessions/${r.sessionId}/turns/${r.turnId}`,
    );
    if (
      !["done", "failed", "cancelled", "interrupted"].includes(
        turn.state.status,
      )
    ) {
      setTimeout(() => void monitor(r), 3000).unref();
      return;
    }
    const rows: any[] = [];
    let page: string | undefined;
    do {
      const events = await forgeRequest(
        `/sessions/${r.sessionId}/turns/${r.turnId}/events?limit=100${page ? `&page_token=${encodeURIComponent(page)}` : ""}`,
      );
      rows.push(...events.data.map((row: any) => row.event || row));
      page = events.next_page_token;
    } while (page);
    const creationCalls = new Set(
      rows.flatMap((row) =>
        row.type === "model.message"
          ? (row.tool_calls || [])
              .filter((c: any) =>
                ["create_video", "render_design"].includes(c.function?.name),
              )
              .map((c: any) => c.id)
          : [],
      ),
    );
    for (const row of rows) {
      if (row.type !== "tool.response" || !creationCalls.has(row.tool_call_id))
        continue;
      try {
        const p = JSON.parse(row.content);
        if (p.id && p.projectUrl && !r.projectIds.includes(p.id))
          r.projectIds.push(p.id);
      } catch {}
    }
    // The aggregate already includes cached and reasoning tokens: never add them again.
    const reviews = rows
      .filter((row) => row.type === "tool.response")
      .flatMap((row) => {
        try {
          const v = JSON.parse(row.content).visionReview;
          return v?.usage ? [v] : [];
        } catch {
          return [];
        }
      });
    r.metrics = { ...turn.state.metrics };
    r.visionModelCalls = reviews.length;
    for (const review of reviews) {
      const u = review.usage,
        m = r.metrics!;
      m.total_input_tokens = (m.total_input_tokens || 0) + u.input_tokens;
      m.total_output_tokens = (m.total_output_tokens || 0) + u.output_tokens;
      m.total_tokens = (m.total_tokens || 0) + u.total_tokens;
      m.total_cache_read_tokens =
        (m.total_cache_read_tokens || 0) +
        (u.input_tokens_details?.cached_tokens || 0);
      m.total_cache_write_tokens =
        (m.total_cache_write_tokens || 0) +
        (u.input_tokens_details?.cache_write_tokens || 0);
      m.total_reasoning_tokens =
        (m.total_reasoning_tokens || 0) +
        (u.output_tokens_details?.reasoning_tokens || 0);
    }
    const messages = rows.filter(
      (row: any) => row.type === "model.message" && row.usage,
    );
    r.modelCalls = messages.length + reviews.length;
    const m = r.metrics;
    const complete =
      m &&
      messages.reduce(
        (n: number, row: any) => n + row.usage.input_tokens,
        0,
      ) === turn.state.metrics?.total_input_tokens;
    // Unknown subagent models and long context need a different rate card.
    const eligible =
      complete &&
      reviews.every(
        (v) => v.model.startsWith(r.model) && v.usage.input_tokens < 128000,
      ) &&
      messages.every(
        (row: any) =>
          row.thread_id === "main" && row.usage.input_tokens < 128000,
      );
    const price = eligible
      ? estimateTokens(
          r.model,
          m.total_input_tokens,
          m.total_output_tokens,
          m.total_cache_read_tokens || 0,
          m.total_cache_write_tokens || 0,
        )
      : undefined;
    r.modelEstimateUsd = price?.usd;
    r.cacheDiscountUsd = price?.cacheDiscountUsd;
    r.status = turn.state.status === "done" ? "measured" : turn.state.status;
    r.error = undefined;
    if (!price)
      r.error =
        "Dollar estimate unavailable for incomplete, mixed-model or unsupported rate-card usage.";
    await persist(r);
  } catch (err) {
    r.error = String(err instanceof Error ? err.message : err).slice(0, 400);
    await persist(r);
    setTimeout(() => void monitor(r), 15000).unref();
  }
}
export async function restoreUsage() {
  await fs.mkdir(folder, { recursive: true });
  for (const file of await fs.readdir(folder)) {
    if (!file.endsWith(".json")) continue;
    try {
      const r: Run = JSON.parse(
        await fs.readFile(path.join(folder, file), "utf8"),
      );
      runs.set(r.turnId, r);
      if (r.status === "pending" || r.error) void monitor(r);
    } catch {}
  }
}
export function projectUsage(p: Project) {
  const run = [...runs.values()].find((r) => r.projectIds.includes(p.id));
  const audioEstimateUsd = p.duration
    ? p.plan.presenterAssetId
      ? (Math.ceil(p.duration) / 60) * 0.006
      : p.audioModel === "gpt-4o-mini-tts"
        ? (p.scenes!.reduce((n, s) => n + s.duration - 0.25, 0) / 60) * 0.015
        : undefined
    : undefined;
  const finalReview = p.visualReview?.usage;
  const extraPrice = finalReview
    ? estimateTokens(
        p.visualReview!.model,
        finalReview.input_tokens,
        finalReview.output_tokens,
        finalReview.input_tokens_details?.cached_tokens || 0,
        finalReview.input_tokens_details?.cache_write_tokens || 0,
      )
    : undefined;
  const metrics = run?.metrics ? { ...run.metrics } : undefined;
  if (metrics && finalReview) {
    metrics.total_input_tokens += finalReview.input_tokens;
    metrics.total_output_tokens += finalReview.output_tokens;
    metrics.total_tokens += finalReview.total_tokens;
    metrics.total_cache_read_tokens =
      (metrics.total_cache_read_tokens || 0) +
      (finalReview.input_tokens_details?.cached_tokens || 0);
    metrics.total_cache_write_tokens =
      (metrics.total_cache_write_tokens || 0) +
      (finalReview.input_tokens_details?.cache_write_tokens || 0);
    metrics.total_reasoning_tokens =
      (metrics.total_reasoning_tokens || 0) +
      (finalReview.output_tokens_details?.reasoning_tokens || 0);
  }
  const modelEstimateUsd =
    run?.modelEstimateUsd !== undefined && (!finalReview || extraPrice)
      ? run.modelEstimateUsd + (extraPrice?.usd || 0)
      : undefined;
  const shared = !!run && run.projectIds.length > 1;
  return {
    ...run,
    metrics,
    modelEstimateUsd,
    modelCalls: (run?.modelCalls || 0) + (finalReview ? 1 : 0),
    visionModelCalls: (run?.visionModelCalls || 0) + (finalReview ? 1 : 0),
    cacheDiscountUsd:
      run?.cacheDiscountUsd !== undefined
        ? run.cacheDiscountUsd + (extraPrice?.cacheDiscountUsd || 0)
        : undefined,
    audioEstimateUsd,
    audioBasis: p.plan.presenterAssetId
      ? "Whisper import allocation; reused recording is not billed again on revisions"
      : "TTS duration estimate, not measured audio tokens",
    estimatedUsd:
      !shared &&
      modelEstimateUsd !== undefined &&
      audioEstimateUsd !== undefined
        ? modelEstimateUsd + audioEstimateUsd
        : undefined,
    sharedTurn: shared,
    pricingDate: "2026-09-26",
    pricingSource: "https://developers.openai.com/api/docs/pricing",
    exclusions:
      "Bundled image creation, local compute, failed/retried API attempts and account-specific discounts. No TrueFoundry savings benchmark yet.",
    imageAsset:
      p.plan.motion?.html.includes("cafe.png") ||
      p.plan.scenes.some((s) => ["web", "photo"].includes(s.visual))
        ? "Reused bundled AI photo; no per-video image generation call"
        : undefined,
    renderingModelCalls: 0,
  };
}
