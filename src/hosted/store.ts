import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
export class OwnershipError extends Error {
  status = 404;
  constructor() {
    super("Resource not found");
  }
}
export type OwnedResource = {
  id: string;
  kind: string;
  metadata: Record<string, unknown>;
};
export class HostedStore {
  constructor(readonly pool: Pool) {}
  async own(userId: string, kind: string, id: string, metadata: unknown = {}) {
    const result = await this.pool.query(
      "INSERT INTO yap_resources(kind,id,user_id,metadata) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,kind,id) DO UPDATE SET metadata=yap_resources.metadata||EXCLUDED.metadata WHERE yap_resources.user_id=EXCLUDED.user_id RETURNING id",
      [kind, id, userId, JSON.stringify(metadata)],
    );
    if (!result.rows.length) throw new OwnershipError();
  }
  async assertOwn(userId: string, kind: string, id: string) {
    const found = await this.pool.query(
      "SELECT 1 FROM yap_resources WHERE kind=$1 AND id=$2 AND user_id=$3",
      [kind, id, userId],
    );
    if (!found.rows.length) throw new OwnershipError();
  }
  async listOwned(userId: string, kind: string): Promise<string[]> {
    const found = await this.pool.query<{ id: string }>(
      "SELECT id FROM yap_resources WHERE user_id=$1 AND kind=$2 ORDER BY created_at DESC",
      [userId, kind],
    );
    return found.rows.map((r) => r.id);
  }
  async resource(
    userId: string,
    kind: string,
    id: string,
  ): Promise<OwnedResource> {
    const found = await this.pool.query<OwnedResource>(
      "SELECT id,kind,metadata FROM yap_resources WHERE user_id=$1 AND kind=$2 AND id=$3",
      [userId, kind, id],
    );
    if (!found.rows[0]) throw new OwnershipError();
    return found.rows[0];
  }
  async saveProject(userId: string, id: string, payload: unknown) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const p = await client.query(
        "INSERT INTO yap_projects(id,user_id,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now() WHERE yap_projects.user_id=EXCLUDED.user_id RETURNING id",
        [id, userId, JSON.stringify(payload)],
      );
      if (!p.rows.length) throw new OwnershipError();
      const r = await client.query(
        "INSERT INTO yap_resources(kind,id,user_id) VALUES('project',$1,$2) ON CONFLICT(user_id,kind,id) DO UPDATE SET id=EXCLUDED.id WHERE yap_resources.user_id=EXCLUDED.user_id RETURNING id",
        [id, userId],
      );
      if (!r.rows.length) throw new OwnershipError();
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async getProject<T = Record<string, unknown>>(
    userId: string,
    id: string,
  ): Promise<T> {
    const found = await this.pool.query<{ payload: T }>(
      "SELECT payload FROM yap_projects WHERE id=$1 AND user_id=$2",
      [id, userId],
    );
    if (!found.rows[0]) throw new OwnershipError();
    return found.rows[0].payload;
  }
  async listProjects<T = Record<string, unknown>>(
    userId: string,
  ): Promise<T[]> {
    const found = await this.pool.query<{ payload: T }>(
      "SELECT payload FROM yap_projects WHERE user_id=$1 ORDER BY created_at DESC",
      [userId],
    );
    return found.rows.map((r) => r.payload);
  }
  /** A completed version is append-only; stable revision number makes repeated finalization idempotent. */
  async saveVersion(
    userId: string,
    projectId: string,
    revision: number,
    payload: unknown,
  ): Promise<string> {
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw new Error("Revision must be a positive integer");
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO yap_versions(id,project_id,user_id,revision,payload) SELECT $1,p.id,p.user_id,$4,$5 FROM yap_projects p WHERE p.id=$2 AND p.user_id=$3 ON CONFLICT(project_id,revision) DO NOTHING RETURNING id`,
      [randomUUID(), projectId, userId, revision, JSON.stringify(payload)],
    );
    if (result.rows[0]) return result.rows[0].id;
    const existing = await this.pool.query<{ id: string }>(
      "SELECT id FROM yap_versions WHERE project_id=$1 AND revision=$2 AND user_id=$3",
      [projectId, revision, userId],
    );
    if (!existing.rows[0]) throw new OwnershipError();
    return existing.rows[0].id;
  }
  async listVersions(userId: string, projectId: string) {
    await this.assertOwn(userId, "project", projectId);
    return (
      await this.pool.query(
        "SELECT id,revision,payload,created_at FROM yap_versions WHERE user_id=$1 AND project_id=$2 ORDER BY revision DESC",
        [userId, projectId],
      )
    ).rows;
  }
  async saveAsset(
    userId: string,
    id: string,
    kind: string,
    metadata: unknown,
    objectKey?: string,
  ) {
    const result = await this.pool.query(
      "INSERT INTO yap_assets(id,user_id,kind,object_key,metadata) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,id) DO UPDATE SET metadata=EXCLUDED.metadata,object_key=COALESCE(EXCLUDED.object_key,yap_assets.object_key) WHERE yap_assets.user_id=EXCLUDED.user_id RETURNING id",
      [id, userId, kind, objectKey ?? null, JSON.stringify(metadata)],
    );
    if (!result.rows[0]) throw new OwnershipError();
    await this.own(userId, kind, id, metadata);
  }
  async getAsset(userId: string, id: string) {
    const found = await this.pool.query(
      "SELECT id,kind,object_key,metadata,created_at FROM yap_assets WHERE id=$1 AND user_id=$2",
      [id, userId],
    );
    if (!found.rows[0]) throw new OwnershipError();
    return found.rows[0];
  }
  async searchAssets(userId: string, query: string, limit = 50) {
    const needle = query.slice(0, 240).replace(/[\\%_]/g, "\\$&");
    return (
      await this.pool.query(
        "SELECT id,kind,object_key,metadata,created_at FROM yap_assets WHERE user_id=$1 AND metadata::text ILIKE $2 ORDER BY created_at DESC LIMIT $3",
        [userId, `%${needle}%`, Math.max(1, Math.min(100, limit))],
      )
    ).rows;
  }
}
