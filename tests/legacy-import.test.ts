import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";

test(
  "Postgres legacy import isolates owners, preserves newer cloud projects and is idempotent",
  { skip: !process.env.HOSTED_TEST_DATABASE_URL },
  async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "yap-legacy-test-"));
    const email = `legacy-${randomUUID()}@example.test`,
      otherEmail = `legacy-other-${randomUUID()}@example.test`;
    Object.assign(process.env, {
      YAP_HOSTED: "1",
      YAP_RENDER_WORKER: "1",
      YAP_DATA_DIR: folder,
      DATABASE_URL: process.env.HOSTED_TEST_DATABASE_URL,
      OWNER_EMAIL: email,
      OWNER_PASSWORD: "private-test-password-123",
      APP_ORIGIN: "https://test.invalid",
      MCP_SHARED_SECRET: randomBytes(32).toString("hex"),
      R2_ENDPOINT: "https://storage.invalid",
      R2_BUCKET: "test",
      R2_ACCESS_KEY_ID: "fake-test-access",
      R2_SECRET_ACCESS_KEY: "fake-test-secret",
      R2_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      R2_PREFIX: "educative-yap",
    });
    const { initializeHosted } = await import("../src/hosted/integrations.js");
    const { importLegacyHistory } =
      await import("../src/hosted/legacy-import.js");
    const state = await initializeHosted();
    assert.ok(state);
    const owner = (
      await state.pool.query("SELECT id FROM yap_users WHERE email=$1", [email])
    ).rows[0].id;
    const other = randomUUID(),
      fresh = randomUUID(),
      existing = randomUUID(),
      collision = randomUUID(),
      design = randomUUID(),
      asset = randomBytes(32).toString("hex");
    const key = state.storage.key(owner, "legacy-bootstrap", "test.json");
    process.env.YAP_LEGACY_MANIFEST_KEY = key;
    let manifest: any = {
      format: "educative-yap-legacy-v1",
      ownerId: owner,
      exportedAt: new Date().toISOString(),
      projects: [
        {
          id: fresh,
          payload: {
            id: fresh,
            status: "complete",
            plan: { title: "Imported" },
          },
          files: { "video.mp4": state.storage.key(owner, fresh, "video.mp4") },
        },
        {
          id: existing,
          payload: {
            id: existing,
            status: "complete",
            plan: { title: "Old local title" },
          },
          files: {},
        },
      ],
      assets: [
        {
          id: asset,
          kind: "image",
          metadata: {
            id: asset,
            title: "Archived image",
            files: { image: state.storage.key(owner, asset, "image") },
          },
          objectKey: state.storage.key(owner, asset, "image"),
        },
      ],
      usage: [
        {
          name: "old-turn.json",
          payload: {
            turnId: "old-turn",
            status: "pending",
            error: "Old offline turn",
            projectIds: [fresh],
            metrics: { inputTokens: 12 },
          },
        },
      ],
      designs: [{ id: design, plan: { title: "Saved animation" } }],
    };
    state.storage.downloadFile = async (_owner, _key, destination) => {
      await fs.writeFile(destination, JSON.stringify(manifest));
    };
    try {
      await state.pool.query(
        "INSERT INTO yap_users(id,email,password_hash,role) VALUES($1,$2,'not-used','user')",
        [other, otherEmail],
      );
      await state.store.saveProject(owner, existing, {
        id: existing,
        status: "complete",
        plan: { title: "New cloud title" },
      });
      await state.store.saveProject(other, collision, {
        id: collision,
        status: "complete",
        plan: { title: "Other account" },
      });
      manifest.ownerId = other;
      await assert.rejects(importLegacyHistory(), /different owner/);
      manifest.ownerId = owner;
      const oldKey = manifest.assets[0].objectKey;
      manifest.assets[0].objectKey = state.storage.key(other, asset, "image");
      await assert.rejects(importLegacyHistory(), /does not belong/);
      manifest.assets[0].objectKey = oldKey;
      manifest.projects.push({
        id: collision,
        payload: { id: collision, status: "complete" },
        files: {},
      });
      await assert.rejects(importLegacyHistory(), /collides/);
      manifest.projects.pop();
      await importLegacyHistory();
      await importLegacyHistory();
      assert.equal(
        (await state.store.getProject<any>(owner, existing)).plan.title,
        "New cloud title",
      );
      assert.equal(
        (await state.store.getProject<any>(owner, fresh)).plan.title,
        "Imported",
      );
      assert.equal((await state.store.listVersions(owner, fresh)).length, 1);
      assert.equal(
        (await state.store.searchAssets(owner, "Archived")).length,
        1,
      );
      await assert.rejects(state.store.getAsset(other, asset), /not found/);
      const usage = JSON.parse(
        await fs.readFile(path.join(folder, "usage/old-turn.json"), "utf8"),
      );
      assert.equal(usage.status, "archived");
      assert.equal(usage.error, undefined);
      assert.equal(usage.legacyOriginalError, "Old offline turn");
      assert.equal(
        JSON.parse(
          await fs.readFile(
            path.join(folder, "designs", design, "plan.json"),
            "utf8",
          ),
        ).title,
        "Saved animation",
      );
      await fs.rm(path.join(folder, "usage"), { recursive: true });
      await importLegacyHistory();
      assert.ok(
        (await fs.stat(path.join(folder, "usage/old-turn.json"))).isFile(),
      );
    } finally {
      for (const table of [
        "yap_sessions",
        "yap_resources",
        "yap_assets",
        "yap_versions",
        "yap_jobs",
        "yap_projects",
      ])
        await state.pool.query(
          `DELETE FROM ${table} WHERE user_id IN (SELECT id FROM yap_users WHERE email=ANY($1::text[]))`,
          [[email, otherEmail]],
        );
      await state.pool.query(
        "DELETE FROM yap_users WHERE email=ANY($1::text[])",
        [[email, otherEmail]],
      );
      state.storage.client.destroy();
      await state.pool.end();
      await fs.rm(folder, { recursive: true, force: true });
    }
  },
);
