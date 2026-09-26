import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { config, studioUrl, forgeUrl } from "./config.js";
import { run, stopMediaProcesses } from "./process.js";
import { restoreProjects } from "./projects.js";
import { startServer } from "./server.js";
import { configureForge } from "./trueforge.js";
if (!config.apiKey || config.apiKey.includes("your-key"))
  throw new Error(
    "Set OPENAI_API_KEY in .env before starting. Copy example.env to .env to begin.",
  );
await Promise.all([run("ffmpeg", ["-version"]), run("ffprobe", ["-version"])]);
await fs.mkdir(config.data, { recursive: true });
await restoreProjects();
// Refuse to silently attach to a different TrueForge instance or its database.
try {
  await fetch(`${forgeUrl}/api/v1/agents`, {
    signal: AbortSignal.timeout(500),
  });
  throw new Error(
    `Port ${config.forgePort} is already in use. Stop the other TrueForge process or change PORT in .env.`,
  );
} catch (err) {
  if (err instanceof Error && err.message.includes("already in use")) throw err;
}
const studio = await startServer();
const log = await fs.open(path.join(config.data, "trueforge.log"), "a", 0o600);
const forge = spawn(
  process.execPath,
  [path.join(config.root, "node_modules/@truefoundry/trueforge/dist/cli.js")],
  {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(config.forgePort),
      SQLITE_PATH: path.join(config.data, "trueforge.sqlite"),
      STANDALONE: "true",
      PUBLIC_BASE_URL: forgeUrl,
      OUTBOUND_URL_ALLOWED_HOSTS: JSON.stringify(["127.0.0.1"]),
    },
    stdio: ["ignore", log.fd, log.fd],
  },
);
let stopping = false;
await log.close();
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  stopMediaProcesses();
  forge.kill("SIGTERM");
  studio.http.close();
  setTimeout(() => process.exit(code), 500).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
forge.on("error", (err) => {
  console.error(err.message);
  stop(1);
});
forge.on("exit", (code) => {
  if (!stopping) {
    console.error(`TrueForge exited (${code}). See .data/trueforge.log`);
    stop(1);
  }
});
try {
  let connected = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const r = await fetch(`${forgeUrl}/api/v1/agents`, {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        connected = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  if (!connected)
    throw new Error("TrueForge did not become ready. See .data/trueforge.log");
  await configureForge();
  studio.setReady();
  console.log(
    `\nEducative Yap is ready\nStudio: ${studioUrl}\nTrueForge: ${forgeUrl}\nModel: ${config.model}\nLocal projects: ${config.projects}\n`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : "Startup failed");
  stop(1);
}
