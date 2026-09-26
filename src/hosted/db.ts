import { Pool } from "pg";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function createHostedPool(
  connectionString = process.env.DATABASE_URL,
): Pool {
  if (!connectionString)
    throw new Error("DATABASE_URL is required in hosted mode");
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    ...(process.env.PG_SSL === "true"
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
  });
}

export async function migrateHosted(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(784325301)");
    await client.query(
      await fs.readFile(
        fileURLToPath(
          new URL("../../migrations/001_hosted.sql", import.meta.url),
        ),
        "utf8",
      ),
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
