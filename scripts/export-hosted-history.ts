import fs from "node:fs/promises";
import path from "node:path";
import { PrivateStorage } from "../src/hosted/storage.js";
import type { LegacyManifest } from "../src/hosted/legacy-import.js";

const owner = process.argv[process.argv.indexOf("--owner") + 1];
if (!process.argv.includes("--owner") || !/^[a-f0-9-]{36}$/.test(owner || ""))
  throw new Error(
    "Usage: tsx scripts/export-hosted-history.ts --owner <live-owner-uuid>",
  );
if (["1", "true"].includes(process.env.YAP_HOSTED || ""))
  throw new Error(
    "Run this operator export from the local source checkout, not the hosted server",
  );
const root = process.cwd(),
  data = path.join(root, ".data");
const settings = JSON.parse(
  await fs.readFile(path.join(data, "hosting/hosted-secrets.json"), "utf8"),
);
process.env.R2_ENCRYPTION_KEY = settings.R2_ENCRYPTION_KEY;
const storage = new PrivateStorage({
  endpoint: settings.R2_ENDPOINT,
  bucket: settings.R2_BUCKET || settings.R2_BUCKET_NAME,
  accessKeyId: settings.R2_ACCESS_KEY_ID,
  secretAccessKey: settings.R2_SECRET_ACCESS_KEY,
  prefix: settings.R2_PREFIX,
});
if (!storage.encryptionKey)
  throw new Error("An encryption key is required for history export");
const checkpointPath = path.join(
  data,
  "hosting/history-export-checkpoint.json",
);
const checkpoint: Record<string, { size: number; mtime: number; key: string }> =
  JSON.parse(await fs.readFile(checkpointPath, "utf8").catch(() => "{}"));
const manifest: LegacyManifest = {
  format: "educative-yap-legacy-v1",
  ownerId: owner,
  exportedAt: new Date().toISOString(),
  projects: [],
  assets: [],
  usage: [],
  designs: [],
};
let uploadCount = 0;
async function put(
  resource: string,
  name: string,
  local: string,
  contentType: string,
) {
  const stat = await fs.lstat(local);
  if (!stat.isFile()) throw new Error("History export refuses symbolic links");
  const signature = `${owner}/${resource}/${name}`;
  const prior = checkpoint[signature];
  if (prior?.size === stat.size && prior.mtime === stat.mtimeMs)
    return prior.key;
  const key = await storage.putFile(owner, resource, name, local, contentType);
  checkpoint[signature] = { size: stat.size, mtime: stat.mtimeMs, key };
  // Export serializes checkpoints; each successful transfer survives retry.
  await fs.writeFile(checkpointPath, JSON.stringify(checkpoint), {
    mode: 0o600,
  });
  uploadCount++;
  return key;
}
const readJson = async (file: string) =>
  JSON.parse(await fs.readFile(file, "utf8"));
const list = async (dir: string) => fs.readdir(dir).catch(() => [] as string[]);
const types: Record<string, string> = {
  "video.mp4": "video/mp4",
  "poster.jpg": "image/jpeg",
  "storyboard.json": "application/json",
  "probe.json": "application/json",
  "sources.json": "application/json",
  "clip-sources.json": "application/json",
  "credits.txt": "text/plain",
  "index.html": "text/html",
  "project.json": "application/json",
  "render-input.json": "application/json",
  "captions.srt": "text/plain",
  "captions.vtt": "text/vtt",
};
for (const id of await list(path.join(data, "projects"))) {
  if (!/^[a-f0-9-]{36}$/.test(id)) continue;
  const dir = path.join(data, "projects", id);
  const payload = await readJson(path.join(dir, "project.json")).catch(
    () => undefined,
  );
  if (!payload || payload.id !== id) continue;
  const files: Record<string, string> = {};
  for (const [name, type] of Object.entries(types)) {
    const file = path.join(dir, name);
    if ((await fs.stat(file).catch(() => undefined))?.isFile())
      files[name] = await put(id, name, file, type);
  }
  manifest.projects.push({ id, payload, files });
}
for (const name of await list(path.join(data, "visual-assets"))) {
  if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
  const id = name.slice(0, -5),
    file = path.join(data, "visual-assets", id);
  const metadata = await readJson(file + ".json");
  const files = {
    image: await put(id, "image", file, metadata.contentType),
    "asset.json": await put(
      id,
      "asset.json",
      file + ".json",
      "application/json",
    ),
  };
  manifest.assets.push({
    id,
    kind: "image",
    metadata: { ...metadata, files },
    objectKey: files.image,
  });
}
for (const kind of ["clip", "presenter"] as const) {
  const dir = path.join(data, kind === "clip" ? "video-clips" : "presenters");
  for (const id of await list(dir)) {
    if (!/^[a-f0-9-]{36}$/.test(id)) continue;
    const folder = path.join(dir, id),
      metaName = kind === "clip" ? "clip.json" : "asset.json";
    const metadata = await readJson(path.join(folder, metaName)).catch(
      () => undefined,
    );
    if (!metadata) continue;
    const names =
      kind === "clip"
        ? ["clip.mp4", "clip.json"]
        : ["original-video", "voice.wav", "asset.json"];
    const files: Record<string, string> = {};
    for (const name of names)
      files[name] = await put(
        id,
        name,
        path.join(folder, name),
        name.endsWith(".json")
          ? "application/json"
          : name.endsWith(".wav")
            ? "audio/wav"
            : "video/mp4",
      );
    manifest.assets.push({
      id,
      kind,
      metadata: { ...metadata, files },
      objectKey: files[kind === "clip" ? "clip.mp4" : "original-video"],
    });
  }
}
for (const name of await list(path.join(data, "usage"))) {
  if (/^[A-Za-z0-9_-]{1,100}\.json$/.test(name))
    manifest.usage.push({
      name,
      payload: await readJson(path.join(data, "usage", name)),
    });
}
for (const id of await list(path.join(data, "designs"))) {
  if (!/^[a-f0-9-]{36}$/.test(id)) continue;
  const plan = await readJson(
    path.join(data, "designs", id, "plan.json"),
  ).catch(() => undefined);
  if (plan) manifest.designs.push({ id, plan });
}
const manifestKey = await storage.putJson(
  owner,
  "legacy-bootstrap",
  `history-${Date.now()}.json`,
  manifest,
);
await fs.writeFile(
  path.join(data, "hosting/legacy-manifest-key.json"),
  JSON.stringify({ key: manifestKey, ownerId: owner }),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    manifestKey,
    projects: manifest.projects.length,
    assets: manifest.assets.length,
    usage: manifest.usage.length,
    designs: manifest.designs.length,
    uploadedFiles: uploadCount,
  }),
);
