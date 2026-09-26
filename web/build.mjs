import { cp, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Build Output API: only these static files are uploaded, never backend keys,
// local media, node_modules or the TrueForge state directory.
const directory = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(directory, ".vercel/output");
const backend = new URL(
  process.env.YAP_BACKEND_ORIGIN ||
    "https://educative-yap-api.coolify.sanjayprasadhs.com",
).origin;
if (!backend.startsWith("https://"))
  throw new Error("Hosted backend must use HTTPS");
await mkdir(path.join(output, "static"), { recursive: true });
await cp(path.join(directory, "../public"), path.join(output, "static"), {
  recursive: true,
});
await writeFile(
  path.join(output, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "/api/(.*)",
          dest: `${backend}/api/$1`,
          headers: { "Cache-Control": "private, no-store" },
        },
        {
          src: "/media/(.*)",
          dest: `${backend}/media/$1`,
          headers: { "Cache-Control": "private, no-store" },
        },
        {
          src: "/(.*)",
          headers: {
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "same-origin",
            "X-Frame-Options": "DENY",
          },
          continue: true,
        },
        { handle: "filesystem" },
        { src: "/", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log(`Built static studio and API/media rewrites to ${backend}`);
