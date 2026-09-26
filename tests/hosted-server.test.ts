import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

test(
  "hosted HTTP and MCP deny cross-user project, design, session and media access",
  { skip: !process.env.HOSTED_TEST_DATABASE_URL },
  async () => {
    process.env.YAP_HOSTED = "1";
    process.env.DATABASE_URL = process.env.HOSTED_TEST_DATABASE_URL;
    process.env.STUDIO_PORT = "0";
    process.env.APP_ORIGIN = "http://127.0.0.1:9876";
    process.env.MCP_SHARED_SECRET =
      "isolated-test-secret-with-more-than-thirty-two-characters";
    process.env.R2_ENDPOINT = "https://example.invalid";
    process.env.R2_BUCKET = "test";
    process.env.R2_ACCESS_KEY_ID = "test";
    process.env.R2_SECRET_ACCESS_KEY = "test";
    process.env.R2_ENCRYPTION_KEY = "aa".repeat(32);
    // Do not bootstrap the actual deployment owner when running the isolated test server.
    delete process.env.OWNER_EMAIL;
    delete process.env.OWNER_PASSWORD;
    const { initializeHosted, hosted, mcpSignature } =
      await import("../src/hosted/integrations.js");
    const db = await initializeHosted();
    assert.ok(db);
    const { bootstrapOwner } = await import("../src/hosted/auth.js");
    const suffix = randomUUID(),
      email = `http-owner-${suffix}@example.test`,
      otherEmail = `http-other-${suffix}@example.test`,
      password = "isolated-http-test-123";
    const owner = await bootstrapOwner(db.pool, email, password),
      other = await bootstrapOwner(db.pool, otherEmail, password);
    assert.ok(owner && other);
    const { startServer } = await import("../src/server.js");
    const server = await startServer();
    try {
      const address = server.http.address();
      assert.ok(address && typeof address === "object");
      const origin = `http://127.0.0.1:${address.port}`;
      const login = await fetch(origin + "/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: process.env.APP_ORIGIN!,
        },
        body: JSON.stringify({ email: otherEmail, password }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      const resource = randomUUID();
      await db.store.own(owner.id, "project", resource);
      await db.store.own(owner.id, "design", resource);
      await db.store.own(owner.id, "forge-session", "private-session");
      await db.store.own(owner.id, "forge-turn", "private-turn");
      assert.equal((await fetch(origin + "/api/projects")).status, 401);
      assert.equal(
        (await fetch(origin + `/media/${resource}/video.mp4`)).status,
        401,
      );
      for (const route of [
        `/api/projects/${resource}`,
        `/media/${resource}/video.mp4`,
        "/api/turns/private-session/private-turn",
        "/api/turns/private-session/private-turn/events",
      ])
        assert.equal(
          (await fetch(origin + route, { headers: { cookie } })).status,
          404,
        );
      const list = await fetch(origin + "/api/projects", {
        headers: { cookie },
      });
      assert.deepEqual(await list.json(), []);
      const badMcp = await fetch(
        origin + "/mcp?model=gpt-6-astra&reasoning=high",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      assert.equal(badMcp.status, 403);
      const signature = mcpSignature(other.id, "gpt-6-astra", "high");
      const mcp = await fetch(
        origin +
          `/mcp?model=gpt-6-astra&reasoning=high&owner=${other.id}&signature=${signature}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json,text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "render_design",
              arguments: { design_id: resource },
            },
          }),
        },
      );
      const denied = (await mcp.json()) as any;
      assert.equal(denied.result?.isError, true);
      assert.match(JSON.stringify(denied), /Resource not found/);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.http.close((error) => (error ? reject(error) : resolve())),
      );
      for (const table of [
        "yap_sessions",
        "yap_resources",
        "yap_assets",
        "yap_versions",
        "yap_jobs",
        "yap_projects",
      ])
        await db.pool.query(
          `DELETE FROM ${table} WHERE user_id=ANY($1::uuid[])`,
          [[owner.id, other.id]],
        );
      await db.pool.query("DELETE FROM yap_users WHERE id=ANY($1::uuid[])", [
        [owner.id, other.id],
      ]);
      db.storage.client.destroy();
      await db.pool.end();
    }
  },
);
