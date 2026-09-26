import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { hosted } from "./integrations.js";

const files = z.record(z.string().regex(/^[A-Za-z0-9_.-]+$/), z.string());
export const legacyManifestSchema = z.object({
  format: z.literal("educative-yap-legacy-v1"),
  ownerId: z.string().uuid(),
  exportedAt: z.string(),
  projects: z
    .array(
      z.object({
        id: z.string().uuid(),
        payload: z.record(z.string(), z.any()),
        files,
      }),
    )
    .max(1000),
  assets: z
    .array(
      z.object({
        id: z.string().regex(/^(?:[a-f0-9]{64}|[a-f0-9-]{36})$/),
        kind: z.enum(["image", "clip", "presenter"]),
        metadata: z.record(z.string(), z.any()),
        objectKey: z.string(),
      }),
    )
    .max(10000),
  usage: z
    .array(
      z.object({
        name: z.string().regex(/^[A-Za-z0-9_-]{1,100}\.json$/),
        payload: z.record(z.string(), z.any()),
      }),
    )
    .max(10000),
  designs: z
    .array(
      z.object({ id: z.string().uuid(), plan: z.record(z.string(), z.any()) }),
    )
    .max(10000)
    .default([]),
});
export type LegacyManifest = z.infer<typeof legacyManifestSchema>;

/** Import the encrypted operator snapshot into the bootstrapped owner's namespace. */
export async function importLegacyHistory() {
  const objectKey = process.env.YAP_LEGACY_MANIFEST_KEY;
  if (!hosted || !objectKey) return;
  const owner = (
    await hosted.pool.query<{ id: string }>(
      "SELECT id FROM yap_users WHERE email=$1 AND role='owner'",
      [String(process.env.OWNER_EMAIL || "").toLowerCase()],
    )
  ).rows[0];
  if (!owner)
    throw new Error("Legacy import requires the configured owner account");
  hosted.storage.assertOwnedKey(owner.id, objectKey);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "yap-legacy-"));
  try {
    const local = path.join(temp, "manifest.json");
    await hosted.storage.downloadFile(owner.id, objectKey, local);
    if ((await fs.stat(local)).size > 50 * 1024 * 1024)
      throw new Error("Legacy manifest exceeds size limit");
    const manifest = legacyManifestSchema.parse(
      JSON.parse(await fs.readFile(local, "utf8")),
    );
    if (manifest.ownerId !== owner.id)
      throw new Error("Legacy manifest belongs to a different owner");
    for (const project of manifest.projects) {
      if (project.payload.id !== project.id)
        throw new Error("Legacy project ID mismatch");
      for (const key of Object.values(project.files))
        hosted.storage.assertOwnedKey(owner.id, key);
    }
    for (const asset of manifest.assets) {
      if (asset.metadata.id !== asset.id)
        throw new Error("Legacy asset ID mismatch");
      hosted.storage.assertOwnedKey(owner.id, asset.objectKey);
      for (const key of Object.values(files.parse(asset.metadata.files)))
        hosted.storage.assertOwnedKey(owner.id, key);
    }
    const ids = manifest.projects.map((p) => p.id);
    if (
      ids.length &&
      (
        await hosted.pool.query(
          "SELECT id FROM yap_projects WHERE id=ANY($1::uuid[]) AND user_id<>$2",
          [ids, owner.id],
        )
      ).rows.length
    )
      throw new Error("Legacy project collides with another owner's project");
    const marker = createHash("sha256").update(objectKey).digest("hex");
    const done = (
      await hosted.pool.query(
        "SELECT 1 FROM yap_resources WHERE user_id=$1 AND kind='legacy-import' AND id=$2",
        [owner.id, marker],
      )
    ).rows.length;
    if (!done) {
      for (const asset of manifest.assets) {
        const exists = (
          await hosted.pool.query(
            "SELECT 1 FROM yap_assets WHERE user_id=$1 AND id=$2",
            [owner.id, asset.id],
          )
        ).rows.length;
        if (!exists)
          await hosted.store.saveAsset(
            owner.id,
            asset.id,
            asset.kind,
            asset.metadata,
            asset.objectKey,
          );
      }
      for (const project of manifest.projects) {
        const exists = (
          await hosted.pool.query(
            "SELECT 1 FROM yap_projects WHERE id=$1 AND user_id=$2",
            [project.id, owner.id],
          )
        ).rows.length;
        if (exists) continue; // Never roll a cloud project back to an older local snapshot.
        const payload = { ...project.payload };
        if (!["complete", "failed"].includes(String(payload.status))) {
          payload.status = "failed";
          payload.progress = "Imported unfinished local draft";
          payload.error =
            "This local draft was unfinished when imported. Create a revision to continue.";
        }
        await hosted.store.saveProject(owner.id, project.id, payload);
        await hosted.store.own(owner.id, "project", project.id, {
          files: project.files,
          importedFromLocal: true,
        });
        if (payload.status === "complete")
          await hosted.store.saveVersion(owner.id, project.id, 1, payload);
      }
      await hosted.store.own(owner.id, "legacy-import", marker, {
        objectKey,
        exportedAt: manifest.exportedAt,
        projects: manifest.projects.length,
        assets: manifest.assets.length,
      });
    }
    // These are reconstructible caches; refill them even after a disk replacement.
    await fs.mkdir(path.join(config.data, "usage"), { recursive: true });
    for (const item of manifest.usage) {
      const output = path.join(config.data, "usage", item.name);
      const payload: Record<string, any> = {
        ...item.payload,
        legacyOriginalStatus: item.payload.status,
        legacyOriginalError: item.payload.error,
        status: "archived",
      };
      delete payload.error; // Old TrueForge calls are not replayed against the new orchestrator.
      await fs
        .writeFile(output, JSON.stringify(payload), { flag: "wx", mode: 0o600 })
        .catch((error) => {
          if (error.code !== "EEXIST") throw error;
        });
    }
    for (const design of manifest.designs) {
      const dir = path.join(config.data, "designs", design.id);
      await fs.mkdir(dir, { recursive: true });
      await fs
        .writeFile(path.join(dir, "plan.json"), JSON.stringify(design.plan), {
          flag: "wx",
          mode: 0o600,
        })
        .catch((error) => {
          if (error.code !== "EEXIST") throw error;
        });
      await hosted.store.own(owner.id, "design", design.id);
    }
    console.log(
      `Legacy history available: ${manifest.projects.length} projects, ${manifest.assets.length} assets, ${manifest.usage.length} usage records`,
    );
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
