import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import {
  Router,
  type RequestHandler,
  type Request,
  type Response,
} from "express";
import type { Pool } from "pg";
import { z } from "zod";

export type HostedUser = { id: string; email: string; role: "owner" | "user" };
declare global {
  namespace Express {
    interface Request {
      hostedUser?: HostedUser;
      hostedSessionToken?: string;
    }
  }
}
const credentials = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(10).max(256),
});
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const csrfForSession = (token: string) =>
  createHmac("sha256", token)
    .update("educative-yap-csrf-v1")
    .digest("base64url");
const passwordOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
let dummyHash: Promise<string> | undefined;
export function cookieName(secure: boolean) {
  return secure ? "__Host-yap-session" : "yap-session";
}
function sessionToken(req: Request, secure: boolean): string | undefined {
  const item = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${cookieName(secure)}=`));
  const token = item?.slice(item.indexOf("=") + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}
export type AuthOptions = {
  publicOrigin: string;
  secureCookies?: boolean;
  sessionDays?: number;
};
function secureCookies(options: AuthOptions) {
  return (
    options.secureCookies ?? new URL(options.publicOrigin).protocol === "https:"
  );
}
function allowedOrigin(req: Request, options: AuthOptions): boolean {
  const origin = req.get("origin");
  return !!origin && origin === new URL(options.publicOrigin).origin;
}
function cookie(
  res: Response,
  token: string,
  options: AuthOptions,
  clear = false,
) {
  const secure = secureCookies(options);
  res.cookie(cookieName(secure), token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: clear ? 0 : (options.sessionDays ?? 7) * 86400_000,
  });
}
export async function bootstrapOwner(
  pool: Pool,
  email = process.env.OWNER_EMAIL,
  password = process.env.OWNER_PASSWORD,
): Promise<HostedUser | null> {
  if (!email && !password) return null;
  if (!email || !password)
    throw new Error("Set both OWNER_EMAIL and OWNER_PASSWORD for bootstrap");
  const input = credentials.parse({ email, password });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(784325302)");
    const existing = await client.query<HostedUser>(
      "SELECT id,email,role FROM yap_users WHERE email=$1",
      [input.email],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].role !== "owner")
        throw new Error("Bootstrap email already belongs to a non-owner");
      await client.query("COMMIT");
      return existing.rows[0];
    }
    const user: HostedUser = {
      id: randomUUID(),
      email: input.email,
      role: "owner",
    };
    await client.query(
      "INSERT INTO yap_users(id,email,password_hash,role) VALUES($1,$2,$3,$4)",
      [
        user.id,
        user.email,
        await hash(input.password, passwordOptions),
        user.role,
      ],
    );
    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export function requireHostedAuth(
  pool: Pool,
  options: AuthOptions,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = sessionToken(req, secureCookies(options));
      if (!token) {
        res.status(401).json({ error: "Please sign in" });
        return;
      }
      const found = await pool.query<HostedUser>(
        "SELECT u.id,u.email,u.role FROM yap_sessions s JOIN yap_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
        [digest(token)],
      );
      if (!found.rows[0]) {
        res.status(401).json({ error: "Session expired. Please sign in" });
        return;
      }
      req.hostedUser = found.rows[0];
      req.hostedSessionToken = token;
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const expected = csrfForSession(token),
          actual = req.get("x-csrf-token") || "";
        if (
          !allowedOrigin(req, options) ||
          Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
          !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
        ) {
          res
            .status(403)
            .json({ error: "Invalid request origin or CSRF token" });
          return;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
export function createAuthRouter(pool: Pool, options: AuthOptions): Router {
  const router = Router();
  const auth = requireHostedAuth(pool, options);
  router.post("/login", async (req, res, next) => {
    try {
      if (!allowedOrigin(req, options)) {
        res.status(403).json({ error: "Invalid request origin" });
        return;
      }
      const parsed = credentials.safeParse(req.body);
      // Invalid credentials use the same rate-limited path and generic response.
      const email = parsed.success
        ? parsed.data.email
        : String(req.body?.email || "")
            .slice(0, 254)
            .trim()
            .toLowerCase();
      const bucket = digest(`${req.ip || req.socket.remoteAddress}|${email}`);
      const ipBucket = digest(`ip|${req.ip || req.socket.remoteAddress}`);
      for (const [key, limit] of [
        [bucket, 10],
        [ipBucket, 50],
      ] as const) {
        const count = await pool.query<{ attempts: number }>(
          `INSERT INTO yap_login_limits(bucket,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN yap_login_limits.expires_at<now() THEN 1 ELSE yap_login_limits.attempts+1 END, expires_at=CASE WHEN yap_login_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE yap_login_limits.expires_at END RETURNING attempts`,
          [key],
        );
        if (count.rows[0].attempts > limit) {
          res.setHeader("Retry-After", "900");
          res
            .status(429)
            .json({ error: "Too many sign-in attempts. Try again later." });
          return;
        }
      }
      const found = await pool.query<HostedUser & { password_hash: string }>(
        "SELECT id,email,role,password_hash FROM yap_users WHERE email=$1",
        [email],
      );
      const user = found.rows[0];
      dummyHash ??= hash(randomBytes(32).toString("hex"), passwordOptions);
      const valid = await verify(
        user?.password_hash || (await dummyHash),
        parsed.success ? parsed.data.password : "invalid-password",
      );
      if (!parsed.success || !user || !valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      const token = randomBytes(32).toString("base64url");
      await pool.query(
        "INSERT INTO yap_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+($3*interval '1 day'))",
        [digest(token), user.id, options.sessionDays ?? 7],
      );
      await pool.query("DELETE FROM yap_login_limits WHERE bucket=$1", [
        bucket,
      ]);
      cookie(res, token, options);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        user: { id: user.id, email: user.email, role: user.role },
        csrfToken: csrfForSession(token),
      });
    } catch (error) {
      next(error);
    }
  });
  router.get("/session", auth, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      user: req.hostedUser,
      csrfToken: csrfForSession(req.hostedSessionToken!),
    });
  });
  router.post("/logout", auth, async (req, res, next) => {
    try {
      await pool.query("DELETE FROM yap_sessions WHERE token_hash=$1", [
        digest(req.hostedSessionToken!),
      ]);
      cookie(res, "", options, true);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
  router.get("/users", auth, async (req, res, next) => {
    try {
      if (req.hostedUser?.role !== "owner") {
        res.status(403).json({ error: "Owner access required" });
        return;
      }
      res.json({
        users: (
          await pool.query(
            "SELECT id,email,role FROM yap_users ORDER BY created_at",
          )
        ).rows,
      });
    } catch (error) {
      next(error);
    }
  });
  router.post("/users", auth, async (req, res, next) => {
    try {
      if (req.hostedUser?.role !== "owner") {
        res.status(403).json({ error: "Owner access required" });
        return;
      }
      const input = credentials.safeParse(req.body);
      if (!input.success) {
        res
          .status(400)
          .json({
            error: "Provide a valid email and a password of 10–256 characters",
          });
        return;
      }
      const id = randomUUID();
      const created = await pool.query(
        "INSERT INTO yap_users(id,email,password_hash,role) VALUES($1,$2,$3,'user') ON CONFLICT(email) DO NOTHING RETURNING id,email,role",
        [
          id,
          input.data.email,
          await hash(input.data.password, passwordOptions),
        ],
      );
      if (!created.rows[0]) {
        res.status(409).json({ error: "User already exists" });
        return;
      }
      res.status(201).json({ user: created.rows[0] });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
