import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";

test(
  "Postgres publication waits for durable media and retry preserves remote files and immutable version",
  { skip: !process.env.HOSTED_TEST_DATABASE_URL },
  async () => {
    const folder = await fs.mkdtemp(
      path.join(os.tmpdir(), "yap-publication-test-"),
    );
    const email = `publication-${randomUUID()}@example.test`;
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
    const { initializeHosted, withOwner } =
      await import("../src/hosted/integrations.js");
    const { save, projectDir } = await import("../src/projects.js");
    const { planSchema } = await import("../src/schema.js");
    const { run } = await import("../src/process.js");
    const state = await initializeHosted();
    assert.ok(state);
    const owner = (
      await state.pool.query("SELECT id FROM yap_users WHERE email=$1", [email])
    ).rows[0].id;
    const id = randomUUID();
    const project = {
      id,
      createdAt: new Date().toISOString(),
      status: "queued" as "queued" | "complete",
      progress: "Queued",
      plan: planSchema.parse({
        title: "Publication fixture",
        summary: "Tests durable publication.",
        scenes: [
          {
            title: "A frame",
            narration: "A test frame.",
            visual: "statement",
            labels: ["Frame"],
          },
        ],
      }),
    };
    const remoteOnly = state.storage.key(owner, id, "credits.txt");
    let fail = true;
    const uploaded: string[] = [];
    state.storage.putFile = async (user, resource, name, local) => {
      assert.equal(user, owner);
      assert.equal(resource, id);
      assert.ok((await fs.stat(local)).isFile());
      if (fail) throw new Error("Simulated object storage outage");
      uploaded.push(name);
      return state.storage.key(user, resource, name);
    };
    try {
      await withOwner(owner, () => save(project));
      await state.store.own(owner, "project", id, {
        files: { "credits.txt": remoteOnly },
      });
      await run("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:size=16x16:rate=30",
        "-t",
        "0.1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        path.join(projectDir(id), "video.mp4"),
      ]);
      project.status = "complete";
      project.progress = "Ready";
      await assert.rejects(
        withOwner(owner, () => save(project)),
        /Simulated object storage outage/,
      );
      assert.equal(
        (await state.store.getProject<any>(owner, id)).status,
        "queued",
      );
      assert.equal((await state.store.listVersions(owner, id)).length, 0);
      fail = false;
      await withOwner(owner, () => save(project));
      assert.equal(
        (await state.store.getProject<any>(owner, id)).status,
        "complete",
      );
      const stored = await state.store.resource(owner, "project", id);
      assert.equal(
        (stored.metadata.files as Record<string, string>)["video.mp4"],
        state.storage.key(owner, id, "video.mp4"),
      );
      assert.equal(
        (stored.metadata.files as Record<string, string>)["credits.txt"],
        remoteOnly,
      );
      assert.ok(uploaded.includes("video.mp4"));
      assert.equal((await state.store.listVersions(owner, id)).length, 1);
      // A recovered completed job may have no local copy of artifacts already published.
      await fs.rm(path.join(projectDir(id), "video.mp4"));
      await withOwner(owner, () => save(project));
      const after = await state.store.resource(owner, "project", id);
      assert.equal(
        (after.metadata.files as Record<string, string>)["video.mp4"],
        state.storage.key(owner, id, "video.mp4"),
      );
      assert.equal(
        (after.metadata.files as Record<string, string>)["credits.txt"],
        remoteOnly,
      );
      assert.equal((await state.store.listVersions(owner, id)).length, 1);
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
          `DELETE FROM ${table} WHERE user_id IN (SELECT id FROM yap_users WHERE email=$1)`,
          [email],
        );
      await state.pool.query("DELETE FROM yap_users WHERE email=$1", [email]);
      state.storage.client.destroy();
      await state.pool.end();
      await fs.rm(folder, { recursive: true, force: true });
    }
  },
);
