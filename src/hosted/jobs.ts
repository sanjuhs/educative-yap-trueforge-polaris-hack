import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { OwnershipError } from "./store.js";
export type HostedJob = {
  id: string;
  user_id: string;
  kind: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  attempts: number;
  max_attempts: number;
  lease_until: Date | null;
  worker_id: string | null;
  result: unknown;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};
export type JobLimits = {
  globalConcurrency?: number;
  userConcurrency?: number;
  maxQueuedPerUser?: number;
  leaseSeconds?: number;
};
export class QueueLimitError extends Error {
  status = 429;
  constructor() {
    super("Generation limit reached. Wait for your current jobs to finish.");
  }
}
export class HostedJobs {
  readonly limits: Required<JobLimits>;
  constructor(
    readonly pool: Pool,
    limits: JobLimits = {},
  ) {
    this.limits = {
      globalConcurrency:
        limits.globalConcurrency ??
        Number(process.env.GENERATION_CONCURRENCY || 2),
      userConcurrency:
        limits.userConcurrency ??
        Number(process.env.GENERATION_USER_CONCURRENCY || 1),
      maxQueuedPerUser:
        limits.maxQueuedPerUser ??
        Number(process.env.GENERATION_MAX_QUEUED || 5),
      leaseSeconds: limits.leaseSeconds ?? 120,
    };
    for (const value of Object.values(this.limits))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error("Job limits must be positive integers");
  }
  async enqueue(
    userId: string,
    kind: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    maxAttempts = 3,
  ): Promise<HostedJob> {
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new Error("An idempotency key of 1–200 characters is required");
    if (
      !Number.isSafeInteger(maxAttempts) ||
      maxAttempts < 1 ||
      maxAttempts > 10
    )
      throw new Error("maxAttempts must be 1–10");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `yap-enqueue-${userId}`,
      ]);
      const prior = await client.query<HostedJob>(
        "SELECT * FROM yap_jobs WHERE user_id=$1 AND idempotency_key=$2",
        [userId, idempotencyKey],
      );
      if (prior.rows[0]) {
        await client.query("COMMIT");
        return prior.rows[0];
      }
      const count = await client.query<{ n: string }>(
        "SELECT count(*) AS n FROM yap_jobs WHERE user_id=$1 AND kind=$2 AND status IN ('queued','running')",
        [userId, kind],
      );
      if (Number(count.rows[0].n) >= this.limits.maxQueuedPerUser)
        throw new QueueLimitError();
      const result = await client.query<HostedJob>(
        "INSERT INTO yap_jobs(id,user_id,kind,idempotency_key,payload,max_attempts) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          randomUUID(),
          userId,
          kind,
          idempotencyKey,
          JSON.stringify(payload),
          maxAttempts,
        ],
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async claim(workerId: string): Promise<HostedJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize the inexpensive scheduler decision across replicas, not the actual work.
      await client.query("SELECT pg_advisory_xact_lock(784325303)");
      await client.query(
        `UPDATE yap_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,error='Worker lease expired; interrupted work is eligible for recovery',worker_id=NULL,lease_until=NULL,updated_at=now() WHERE status='running' AND lease_until<now()`,
      );
      const ready = await client.query<HostedJob>(
        `SELECT j.* FROM yap_jobs j WHERE j.status='queued' AND j.available_at<=now() AND j.attempts<j.max_attempts AND (SELECT count(*) FROM yap_jobs running WHERE running.kind=j.kind AND running.status='running')<$2 AND (SELECT count(*) FROM yap_jobs running WHERE running.user_id=j.user_id AND running.kind=j.kind AND running.status='running')<$1 ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`,
        [this.limits.userConcurrency, this.limits.globalConcurrency],
      );
      if (!ready.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const result = await client.query<HostedJob>(
        `UPDATE yap_jobs SET status='running',attempts=attempts+1,worker_id=$2,lease_until=now()+($3*interval '1 second'),updated_at=now() WHERE id=$1 RETURNING *`,
        [ready.rows[0].id, workerId, this.limits.leaseSeconds],
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async heartbeat(id: string, workerId: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE yap_jobs SET lease_until=now()+($3*interval '1 second'),updated_at=now() WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now() RETURNING id",
      [id, workerId, this.limits.leaseSeconds],
    );
    return !!result.rows.length;
  }
  async checkpoint(
    id: string,
    workerId: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE yap_jobs SET payload=payload||$3::jsonb,updated_at=now() WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now() RETURNING id",
      [id, workerId, JSON.stringify(patch)],
    );
    return !!result.rows.length;
  }
  async progress(
    id: string,
    workerId: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE yap_jobs SET result=COALESCE(result,'{}'::jsonb)||$3::jsonb,updated_at=now() WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now() RETURNING id",
      [id, workerId, JSON.stringify(patch)],
    );
    return !!result.rows.length;
  }
  async complete(
    id: string,
    workerId: string,
    result: unknown,
  ): Promise<boolean> {
    const updated = await this.pool.query(
      "UPDATE yap_jobs SET status='completed',result=$3,error=NULL,lease_until=NULL,worker_id=NULL,updated_at=now() WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now() RETURNING id",
      [id, workerId, JSON.stringify(result)],
    );
    return !!updated.rows.length;
  }
  async fail(
    id: string,
    workerId: string,
    error: string,
    retryable = true,
  ): Promise<boolean> {
    const updated = await this.pool.query(
      `UPDATE yap_jobs SET status=CASE WHEN $4 AND attempts<max_attempts THEN 'queued' ELSE 'failed' END,error=$3,available_at=now()+(LEAST(300,5*power(2,attempts))*interval '1 second'),lease_until=NULL,worker_id=NULL,updated_at=now() WHERE id=$1 AND worker_id=$2 AND status='running' AND lease_until>now() RETURNING id`,
      [id, workerId, error.slice(0, 2000), retryable],
    );
    return !!updated.rows.length;
  }
  async retry(userId: string, id: string): Promise<HostedJob> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `yap-enqueue-${userId}`,
      ]);
      const count = await client.query<{ n: string }>(
        "SELECT count(*) AS n FROM yap_jobs WHERE user_id=$1 AND kind=(SELECT kind FROM yap_jobs WHERE id=$2 AND user_id=$1) AND status IN ('queued','running')",
        [userId, id],
      );
      if (Number(count.rows[0].n) >= this.limits.maxQueuedPerUser)
        throw new QueueLimitError();
      const result = await client.query<HostedJob>(
        "UPDATE yap_jobs SET status='queued',max_attempts=attempts+3,error=NULL,available_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2 AND status='failed' RETURNING *",
        [id, userId],
      );
      if (!result.rows[0]) throw new OwnershipError();
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async get(userId: string, id: string): Promise<HostedJob> {
    const result = await this.pool.query<HostedJob>(
      "SELECT * FROM yap_jobs WHERE id=$1 AND user_id=$2",
      [id, userId],
    );
    if (!result.rows[0]) throw new OwnershipError();
    return result.rows[0];
  }
  async list(userId: string): Promise<HostedJob[]> {
    return (
      await this.pool.query<HostedJob>(
        "SELECT * FROM yap_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [userId],
      )
    ).rows;
  }
}
