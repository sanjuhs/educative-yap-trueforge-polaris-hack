import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { createHostedPool, migrateHosted } from "../src/hosted/db.js";
import {
  bootstrapOwner,
  createAuthRouter,
  requireHostedAuth,
  csrfForSession,
  cookieName,
} from "../src/hosted/auth.js";
import { HostedStore, OwnershipError } from "../src/hosted/store.js";
import { HostedJobs, QueueLimitError } from "../src/hosted/jobs.js";
import { PrivateStorage } from "../src/hosted/storage.js";

test("session CSRF values are stable, bound to the opaque session, and cookie names enforce secure scope", () => {
  assert.equal(csrfForSession("test-token"), csrfForSession("test-token"));
  assert.notEqual(
    csrfForSession("test-token"),
    csrfForSession("another-token"),
  );
  assert.equal(cookieName(true), "__Host-yap-session");
  assert.equal(cookieName(false), "yap-session");
});
test("private object storage rejects cross-user paths and traversal", () => {
  const storage = new PrivateStorage({
    endpoint: "https://example.invalid",
    bucket: "test",
    accessKeyId: "test",
    secretAccessKey: "test",
  });
  assert.equal(
    storage.key("user-a", "project", "video.mp4"),
    "educative-yap/user-a/project/video.mp4",
  );
  assert.throws(() => storage.key("user-a", "../project", "video.mp4"));
  assert.throws(() =>
    storage.assertOwnedKey("user-a", "educative-yap/user-b/project/video.mp4"),
  );
  assert.throws(() =>
    storage.assertOwnedKey(
      "user-a",
      "educative-yap/user-a/../user-b/video.mp4",
    ),
  );
  storage.client.destroy();
});

test(
  "Postgres hosted auth, isolation, immutable versions and durable queue",
  { skip: !process.env.HOSTED_TEST_DATABASE_URL },
  async () => {
    const pool = createHostedPool(process.env.HOSTED_TEST_DATABASE_URL);
    const suffix = randomUUID();
    const email = `owner-${suffix}@example.test`;
    const password = "test-passphrase-123";
    let closeServer: (() => Promise<void>) | undefined;
    try {
      await migrateHosted(pool);
      await migrateHosted(pool);
      const owner = await bootstrapOwner(pool, email, password);
      assert.ok(owner);
      const again = await bootstrapOwner(pool, email, "different-password-123");
      assert.equal(again?.id, owner.id);
      const app = express();
      app.use(express.json());
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      closeServer = () =>
        new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const origin = `http://127.0.0.1:${address.port}`;
      const options = { publicOrigin: origin };
      app.use("/api/auth", createAuthRouter(pool, options));
      app.post("/api/private", requireHostedAuth(pool, options), (req, res) =>
        res.json({ id: req.hostedUser?.id }),
      );
      const request = async (
        path: string,
        body?: unknown,
        cookie?: string,
        csrf?: string,
        customOrigin = origin,
      ) =>
        fetch(origin + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            origin: customOrigin,
            ...(body !== undefined
              ? { "content-type": "application/json" }
              : {}),
            ...(cookie ? { cookie } : {}),
            ...(csrf ? { "x-csrf-token": csrf } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      assert.equal((await request("/api/auth/session")).status, 401);
      assert.equal(
        (
          await request(
            "/api/auth/login",
            { email, password },
            undefined,
            undefined,
            "https://evil.example",
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request("/api/auth/login", {
            email,
            password: "wrong-password-123",
          })
        ).status,
        401,
      );
      const login = await request("/api/auth/login", { email, password });
      assert.equal(login.status, 200);
      const session = (await login.json()) as {
        user: { id: string };
        csrfToken: string;
      };
      assert.equal(session.user.id, owner.id);
      const setCookie = login.headers.get("set-cookie")!;
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Lax/i);
      const cookie = setCookie.split(";")[0];
      assert.equal((await request("/api/private", {}, cookie)).status, 403);
      assert.equal(
        (await request("/api/private", {}, cookie, session.csrfToken)).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/api/private",
            {},
            cookie,
            session.csrfToken,
            "https://evil.example",
          )
        ).status,
        403,
      );
      const created = await request(
        "/api/auth/users",
        { email: `user-${suffix}@example.test`, password },
        cookie,
        session.csrfToken,
      );
      assert.equal(created.status, 201);
      const user = ((await created.json()) as { user: { id: string } }).user;
      const userLogin = await request("/api/auth/login", {
        email: `user-${suffix}@example.test`,
        password,
      });
      const userCookie = userLogin.headers.get("set-cookie")!.split(";")[0];
      const userSession = (await userLogin.json()) as { csrfToken: string };
      assert.equal(
        (
          await request(
            "/api/auth/users",
            { email: `third-${suffix}@example.test`, password },
            userCookie,
            userSession.csrfToken,
          )
        ).status,
        403,
      );
      assert.equal(
        (await request("/api/auth/users", undefined, userCookie)).status,
        403,
      );
      assert.equal(
        (await request("/api/auth/users", undefined, cookie)).status,
        200,
      );
      const store = new HostedStore(pool);
      const project = randomUUID();
      await store.saveProject(owner.id, project, { status: "rendering" });
      await store.saveProject(owner.id, project, { status: "completed" });
      assert.deepEqual(await store.getProject(owner.id, project), {
        status: "completed",
      });
      await assert.rejects(
        () => store.getProject(user.id, project),
        OwnershipError,
      );
      await assert.rejects(
        () => store.assertOwn(user.id, "project", project),
        OwnershipError,
      );
      await assert.rejects(
        () => store.saveProject(user.id, project, { status: "stolen" }),
        OwnershipError,
      );
      const version = await store.saveVersion(owner.id, project, 1, {
        original: true,
      });
      assert.equal(
        await store.saveVersion(owner.id, project, 1, { original: false }),
        version,
      );
      assert.deepEqual(
        (await store.listVersions(owner.id, project))[0].payload,
        { original: true },
      );
      await store.saveAsset(owner.id, "shared-hash", "image", {
        description: "Korean War map",
      });
      await store.saveAsset(user.id, "shared-hash", "image", {
        description: "Korean War map",
      });
      assert.equal((await store.searchAssets(owner.id, "Korean")).length, 1);
      await store.own(owner.id, "design", "private-design");
      await assert.rejects(
        () => store.assertOwn(user.id, "design", "private-design"),
        OwnershipError,
      );
      const jobs = new HostedJobs(pool, {
        globalConcurrency: 2,
        userConcurrency: 1,
        maxQueuedPerUser: 2,
        leaseSeconds: 30,
      });
      const one = await jobs.enqueue(
        owner.id,
        "generate",
        { prompt: "one" },
        "owner-one",
      );
      const two = await jobs.enqueue(
        owner.id,
        "generate",
        { prompt: "two" },
        "owner-two",
      );
      assert.equal(
        (
          await jobs.enqueue(
            owner.id,
            "generate",
            { prompt: "duplicate" },
            "owner-one",
          )
        ).id,
        one.id,
      );
      await assert.rejects(
        () => jobs.enqueue(owner.id, "generate", {}, "owner-three"),
        QueueLimitError,
      );
      const other = await jobs.enqueue(user.id, "generate", {}, "other-one");
      const first = await jobs.claim("worker-a");
      assert.equal(first?.id, one.id);
      const second = await jobs.claim("worker-b");
      assert.equal(second?.id, other.id);
      assert.equal(await jobs.claim("worker-c"), null);
      // Rendering gets its own stage slot so a director waiting on render cannot deadlock itself.
      const pipeline = new HostedJobs(pool, {
        globalConcurrency: 1,
        userConcurrency: 1,
        maxQueuedPerUser: 10,
      });
      const render = await pipeline.enqueue(
        owner.id,
        "render",
        { projectId: project },
        "render-nested",
      );
      assert.equal((await pipeline.claim("render-worker"))?.id, render.id);
      assert.equal(
        await pipeline.complete(render.id, "render-worker", {}),
        true,
      );
      await assert.rejects(() => jobs.get(user.id, one.id), OwnershipError);
      assert.equal(
        await jobs.progress(one.id, "wrong-worker", { turnId: "no" }),
        false,
      );
      assert.equal(
        await jobs.progress(one.id, "worker-a", { turnId: "turn-persisted" }),
        true,
      );
      assert.deepEqual((await jobs.get(owner.id, one.id)).result, {
        turnId: "turn-persisted",
      });
      await pool.query(
        "UPDATE yap_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
        [one.id],
      );
      assert.equal(await jobs.complete(one.id, "worker-a", {}), false);
      const recovered = await jobs.claim("worker-c");
      assert.equal(recovered?.id, one.id);
      assert.equal(recovered?.attempts, 2);
      assert.deepEqual(recovered?.result, { turnId: "turn-persisted" });
      assert.equal(
        await jobs.complete(one.id, "worker-c", { projectId: project }),
        true,
      );
      const next = await jobs.claim("worker-d");
      assert.equal(next?.id, two.id);
      assert.equal(
        await jobs.fail(two.id, "worker-d", "Expected failure", false),
        true,
      );
      assert.equal((await jobs.get(owner.id, two.id)).status, "failed");
      assert.equal((await jobs.retry(owner.id, two.id)).status, "queued");
      assert.equal(
        (await request("/api/auth/logout", {}, cookie, session.csrfToken))
          .status,
        200,
      );
      assert.equal(
        (await request("/api/auth/session", undefined, cookie)).status,
        401,
      );
      for (let i = 0; i < 11; i++) {
        const response = await request("/api/auth/login", {
          email: `missing-${suffix}@example.test`,
          password,
        });
        if (i === 10) assert.equal(response.status, 429);
      }
    } finally {
      await closeServer?.();
      const emails = [email, `user-${suffix}@example.test`];
      for (const table of [
        "yap_sessions",
        "yap_resources",
        "yap_assets",
        "yap_versions",
        "yap_jobs",
        "yap_projects",
      ])
        await pool.query(
          `DELETE FROM ${table} WHERE user_id IN (SELECT id FROM yap_users WHERE email=ANY($1::text[]))`,
          [emails],
        );
      await pool.query("DELETE FROM yap_users WHERE email=ANY($1::text[])", [
        emails,
      ]);
      await pool.end();
    }
  },
);
