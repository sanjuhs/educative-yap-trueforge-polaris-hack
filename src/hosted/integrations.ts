import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { createHostedPool, migrateHosted } from "./db.js";
import { bootstrapOwner } from "./auth.js";
import { HostedStore } from "./store.js";
import { HostedJobs, type HostedJob } from "./jobs.js";
import { PrivateStorage, storageOptionsFromEnv } from "./storage.js";
import { generationSchema } from "../model-options.js";

export const hostedEnabled = ["1", "true"].includes(
  process.env.YAP_HOSTED || "",
);
export let hosted: {
  pool: Pool;
  store: HostedStore;
  jobs: HostedJobs;
  storage: PrivateStorage;
} | null = null;
const owners = new AsyncLocalStorage<string>();
export function currentOwner() {
  return owners.getStore();
}
export function withOwner<T>(ownerId: string, fn: () => T): T {
  return owners.run(ownerId, fn);
}
export function publicOrigin() {
  const url =
    process.env.APP_ORIGIN ||
    process.env.PUBLIC_APP_URL ||
    process.env.PUBLIC_ORIGIN;
  if (!url) throw new Error("PUBLIC_APP_URL is required in hosted mode");
  return new URL(url).origin;
}
export async function initializeHosted() {
  if (!hostedEnabled || hosted) return hosted;
  if (
    (process.env.MCP_SHARED_SECRET || process.env.YAP_MCP_SECRET || "").length <
    32
  )
    throw new Error("MCP_SHARED_SECRET must contain at least 32 characters");
  publicOrigin();
  const pool = createHostedPool();
  await migrateHosted(pool);
  await bootstrapOwner(pool);
  const storage = storageOptionsFromEnv();
  if (!storage)
    throw new Error("Private R2 storage is required in hosted mode");
  hosted = {
    pool,
    store: new HostedStore(pool),
    jobs: new HostedJobs(pool),
    storage: new PrivateStorage(storage),
  };
  return hosted;
}
export function mcpSignature(
  ownerId: string,
  model: string,
  reasoning: string,
) {
  if (!process.env.MCP_SHARED_SECRET && !process.env.YAP_MCP_SECRET)
    throw new Error("Missing MCP_SHARED_SECRET");
  return createHmac(
    "sha256",
    (process.env.MCP_SHARED_SECRET || process.env.YAP_MCP_SECRET)!,
  )
    .update(`${ownerId}\n${model}\n${reasoning}`)
    .digest("hex");
}
export function verifyMcpSignature(
  ownerId: string,
  model: string,
  reasoning: string,
  signature: string,
) {
  if (!/^[a-f0-9-]{36}$/.test(ownerId) || !/^[a-f0-9]{64}$/.test(signature))
    return false;
  const expected = mcpSignature(ownerId, model, reasoning);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
export async function assertResource(kind: string, id: string) {
  if (hosted) {
    const owner = currentOwner();
    if (!owner) throw new Error("Missing authenticated owner context");
    await hosted.store.assertOwn(owner, kind, id);
  }
}
export async function ownResource(
  kind: string,
  id: string,
  metadata: unknown = {},
) {
  if (hosted) {
    const owner = currentOwner();
    if (!owner) throw new Error("Missing authenticated owner context");
    await hosted.store.own(owner, kind, id, metadata);
  }
}
export async function assertPlanAssets(plan: {
  presenterAssetId?: string;
  clipAssetIds?: string[];
  visualAssetIds?: string[];
}) {
  if (!hosted) return;
  const { ensureSourceAsset } = await import("./assets.js");
  if (plan.presenterAssetId)
    await ensureSourceAsset("presenter", plan.presenterAssetId);
  for (const id of plan.clipAssetIds || []) await ensureSourceAsset("clip", id);
  for (const id of plan.visualAssetIds || [])
    await ensureSourceAsset("image", id);
}
let renderHandler: ((projectId: string) => Promise<unknown>) | undefined;
export function registerRenderHandler(
  handler: (projectId: string) => Promise<unknown>,
) {
  renderHandler = handler;
}
export async function enqueueRender(projectId: string) {
  if (!hosted || !currentOwner())
    throw new Error("Hosted render requires authenticated owner");
  return hosted.jobs.enqueue(
    currentOwner()!,
    "render",
    { projectId },
    `render:${projectId}`,
  );
}

async function runGeneration(
  job: HostedJob,
  workerId: string,
  isAlive: () => boolean,
) {
  const { forgeRequest, generationSession } = await import("../trueforge.js");
  const { watchUsage, effectiveToolName } = await import("../usage.js");
  const settings = generationSchema.parse(job.payload.generation);
  const state = (
    job.result && typeof job.result === "object" ? job.result : {}
  ) as Record<string, any>;
  const marker = `\n\n[Internal generation reference ${job.id}: tracking metadata only; never include this in narration or visuals.]`;
  let message = String(
    state.attemptMessage || String(job.payload.message) + marker,
  );
  let sessionId = state.sessionId as string | undefined,
    turnId = state.turnId as string | undefined;
  const persist = async (patch: Record<string, unknown>) => {
    if (!isAlive() || !(await hosted!.jobs.progress(job.id, workerId, patch)))
      throw new Error("Job lease lost");
    Object.assign(state, patch);
  };
  if (state.retryFromCompletedTurn) {
    turnId = undefined;
    message += `\nRetry ${job.attempts}: the previous attempt did not deliver a render. Repair its concrete errors and finish with render_design. Prefer pure deterministic per-frame drawing.`;
    await persist({
      turnId: null,
      attemptMessage: message,
      retryFromCompletedTurn: false,
    });
  }
  if (!sessionId) {
    const session = await generationSession(
      settings,
      job.payload.sessionId as string | undefined,
    );
    sessionId = session.id;
    await ownResource("forge-session", sessionId);
    await persist({
      sessionId,
      sessionReset: session.reset,
      generation: settings,
    });
  }
  await assertResource("forge-session", sessionId);
  if (!turnId) {
    // Recover the narrow crash window between the external POST and its DB checkpoint.
    const existing = await forgeRequest(`/sessions/${sessionId}/turns`);
    const prior = (existing.data || []).find((turn: any) =>
      (turn.input || []).some((item: any) => item.content === message),
    );
    if (prior) turnId = prior.id;
    else {
      if (!isAlive()) throw new Error("Job lease lost");
      const turn = await forgeRequest(`/sessions/${sessionId}/turns`, "POST", {
        input: [{ type: "user.message", content: message }],
        stream: false,
      });
      turnId = turn.data.id;
    }
    await ownResource("forge-turn", turnId!, { sessionId });
    await persist({ turnId });
  }
  await watchUsage(sessionId, turnId!, settings);
  const deadline =
    Date.now() + Number(process.env.GENERATION_TIMEOUT_SECONDS || 7200) * 1000;
  while (isAlive() && Date.now() < deadline) {
    const result = await forgeRequest(`/sessions/${sessionId}/turns/${turnId}`);
    const turnState = result.data?.state;
    const status = turnState?.status;
    if (status === "done" || status === "completed") {
      const rows: any[] = [];
      let page: string | undefined;
      do {
        const events = await forgeRequest(
          `/sessions/${sessionId}/turns/${turnId}/events?limit=100${page ? `&page_token=${encodeURIComponent(page)}` : ""}`,
        );
        rows.push(...events.data.map((r: any) => r.event || r));
        page = events.next_page_token;
      } while (page);
      const calls = new Set(
        rows.flatMap((r: any) =>
          r.type === "model.message"
            ? (r.tool_calls || [])
                .filter((c: any) => effectiveToolName(c) === "render_design")
                .map((c: any) => c.id)
            : [],
        ),
      );
      const projectIds: string[] = [];
      for (const row of rows) {
        if (row.type !== "tool.response" || !calls.has(row.tool_call_id))
          continue;
        try {
          const p = JSON.parse(row.content);
          if (p.id && p.projectUrl) {
            await assertResource("project", p.id);
            projectIds.push(p.id);
          }
        } catch {}
      }
      if (!projectIds.length) {
        await persist({ retryFromCompletedTurn: true });
        throw new Error(
          "The agent finished without producing a render. Its trace is saved; retry will ask it to repair the failed design.",
        );
      }
      return { ...state, sessionId, turnId, projectIds, status: "completed" };
    }
    if (["failed", "cancelled", "interrupted", "error"].includes(status))
      throw new Error(
        "The generation agent stopped before finishing. Inspect the saved trace and retry.",
      );
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(
    isAlive()
      ? "Generation exceeded the configured time limit"
      : "Job lease lost",
  );
}
function redactError(error: unknown) {
  let message = error instanceof Error ? error.message : "Job failed";
  for (const [name, value] of Object.entries(process.env))
    if (
      value &&
      value.length >= 8 &&
      /(KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL)/i.test(name)
    )
      message = message.replaceAll(value, "[redacted]");
  return message;
}
let stopWorkers: (() => void) | undefined;
export function startHostedWorkers(): () => void {
  if (!hosted) return () => {};
  if (stopWorkers) return stopWorkers;
  let stopped = false,
    claiming = false;
  const active = new Set<Promise<void>>();
  async function run(job: HostedJob, workerId: string) {
    let alive = true;
    const heartbeat = setInterval(
      () => {
        void hosted!.jobs
          .heartbeat(job.id, workerId)
          .then((ok) => {
            if (!ok) alive = false;
          })
          .catch(() => {
            alive = false;
          });
      },
      Math.max(1000, (hosted!.jobs.limits.leaseSeconds * 1000) / 3),
    );
    try {
      const result = await withOwner(job.user_id, async () => {
        if (job.kind === "generation")
          return runGeneration(job, workerId, () => alive);
        if (job.kind === "render") {
          if (!renderHandler) throw new Error("Render worker unavailable");
          await assertResource("project", String(job.payload.projectId));
          return await renderHandler(String(job.payload.projectId));
        }
        throw new Error("Unsupported job type");
      });
      if (alive)
        await hosted!.jobs.complete(job.id, workerId, result ?? { ok: true });
    } catch (error) {
      if (alive)
        await hosted!.jobs.fail(job.id, workerId, redactError(error), false);
    } finally {
      clearInterval(heartbeat);
    }
  }
  const tick = async () => {
    if (
      stopped ||
      claiming ||
      active.size >= hosted!.jobs.limits.globalConcurrency * 2
    )
      return;
    claiming = true;
    try {
      const workerId = randomUUID(),
        job = await hosted!.jobs.claim(workerId);
      if (job) {
        const promise = run(job, workerId)
          .catch(() => {})
          .finally(() => active.delete(promise));
        active.add(promise);
      }
    } catch {
      console.error("Hosted job scheduler temporarily unavailable");
    } finally {
      claiming = false;
    }
  };
  const timer = setInterval(() => void tick(), 1000);
  void tick();
  stopWorkers = () => {
    stopped = true;
    clearInterval(timer);
    stopWorkers = undefined;
  };
  return stopWorkers;
}
