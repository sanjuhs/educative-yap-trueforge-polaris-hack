import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { run } from "./process.js";
import { clipDir, readClip } from "./video-clips.js";
import { readVisualAsset, visualAssetPath } from "./visual-assets.js";
import type { RenderInput } from "./render-browser.js";

const MAX_BUNDLE = 100 * 1024 * 1024;
const MAX_OUTPUT = 250 * 1024 * 1024;

export function modalRenderingEnabled() {
  return Boolean(
    process.env.YAP_MODAL_RENDER_URL && process.env.YAP_MODAL_RENDER_TOKEN,
  );
}

/** Send only this job's selected assets to a disposable, network-blocked Sandbox. */
export async function renderAuthoredRemote(
  dir: string,
  options: { timeoutMs?: number; onOutput?: (message: string) => void } = {},
) {
  const endpoint = process.env.YAP_MODAL_RENDER_URL?.replace(/\/$/, "");
  const token = process.env.YAP_MODAL_RENDER_TOKEN;
  if (!endpoint || !token)
    throw new Error(
      "Modal renderer URL/token are required for hosted generation",
    );
  if (!endpoint.startsWith("https://"))
    throw new Error("Modal renderer requires HTTPS");
  const input: RenderInput = JSON.parse(
    await fs.readFile(path.join(dir, "render-input.json"), "utf8"),
  );
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "yap-modal-"));
  const files: string[] = [];
  const contentHash = createHash("sha256");
  let size = 0;
  async function add(source: string, target: string) {
    const stat = await fs.lstat(source);
    if (!stat.isFile())
      throw new Error("Render asset must be an ordinary file");
    size += stat.size;
    if (size > MAX_OUTPUT)
      throw new Error("Selected render assets exceed 250 MiB");
    const destination = path.join(temp, target);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    contentHash.update(target + "\0").update(await fs.readFile(destination));
    files.push(target);
  }
  try {
    await add(path.join(dir, "render-input.json"), "job/render-input.json");
    for (const id of [...new Set(input.plan.visualAssetIds || [])]) {
      await readVisualAsset(id); // Validate identifiers and stored metadata first.
      await add(visualAssetPath(id), `.data/visual-assets/${id}`);
      await add(
        visualAssetPath(id) + ".json",
        `.data/visual-assets/${id}.json`,
      );
    }
    for (const id of [...new Set(input.plan.clipAssetIds || [])]) {
      const clip = await readClip(id);
      await add(
        path.join(clipDir(id), "clip.json"),
        `.data/video-clips/${id}/clip.json`,
      );
      for (let i = 0; i < clip.frameCount; i++) {
        const name = `frame-${String(i).padStart(3, "0")}.jpg`;
        await add(
          path.join(clipDir(id), name),
          `.data/video-clips/${id}/${name}`,
        );
      }
    }
    const bundlePath = path.join(temp, "bundle.tar.gz");
    // Separate argv entries; no shell interpretation or directory traversal.
    await run("tar", ["-czf", bundlePath, "--", ...files], {
      cwd: temp,
      timeout: 120_000,
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    const bundle = await fs.readFile(bundlePath);
    if (bundle.length > MAX_BUNDLE)
      throw new Error("Compressed render assets exceed 100 MiB");
    const headers = { Authorization: `Bearer ${token}` };
    const timeout =
      options.timeoutMs ??
      (input.preview
        ? 360_000
        : Math.max(900_000, input.duration * 6000 + 180_000));
    const started = Date.now();
    const fingerprint = contentHash.digest("hex");
    const receiptPath = path.join(
      dir,
      input.preview ? "modal-preview-job.json" : "modal-render-job.json",
    );
    let jobId: string | undefined;
    // Resume a submitted job after a backend restart instead of duplicating rendering.
    try {
      const saved = JSON.parse(await fs.readFile(receiptPath, "utf8"));
      if (saved.fingerprint === fingerprint && saved.endpoint === endpoint)
        jobId = saved.jobId;
    } catch {
      /* First submission. */
    }
    if (!jobId) {
      options.onOutput?.(
        "Uploading selected assets to the isolated Modal renderer\n",
      );
      const submitted = await fetch(endpoint + "/jobs", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/gzip" },
        body: bundle,
        signal: AbortSignal.timeout(180_000),
      });
      if (!submitted.ok)
        throw new Error(
          `Modal render submission failed (${submitted.status}): ${(await submitted.text()).slice(-1000)}`,
        );
      jobId = (await submitted.json()).jobId;
      if (!jobId || !/^[\w.-]+$/.test(jobId))
        throw new Error("Invalid Modal job receipt");
      await fs.writeFile(
        receiptPath,
        JSON.stringify({
          endpoint,
          jobId,
          fingerprint,
          submittedAt: new Date().toISOString(),
        }),
        { mode: 0o600 },
      );
    }
    options.onOutput?.("Isolated renderer is preparing animation frames\n");
    while (Date.now() - started < timeout) {
      const response = await fetch(`${endpoint}/jobs/${jobId}`, {
        headers,
        signal: AbortSignal.timeout(180_000),
      });
      if (response.status === 202) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }
      if (!response.ok) {
        await fs.rm(receiptPath, { force: true });
        throw new Error(
          `Modal render failed (${response.status}): ${(await response.text()).slice(-4000)}`,
        );
      }
      const resultPath = path.join(temp, "result.tar.gz");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_OUTPUT)
        throw new Error("Modal output exceeds 250 MiB");
      await fs.writeFile(resultPath, bytes);
      const expected = input.preview
        ? ["preview.json", "preview-0.png", "preview-1.png", "preview-2.png"]
        : ["render.mp4"];
      const listing = (await run("tar", ["-tzf", resultPath]))
        .trim()
        .split("\n");
      if (
        listing.length !== expected.length ||
        listing.some((name) => !expected.includes(name))
      )
        throw new Error("Unexpected Modal output files");
      // Archives are constructed by the trusted control plane, never by generated code.
      await run("tar", ["-xzf", resultPath, "-C", dir, "--", ...expected], {
        timeout: 120_000,
      });
      options.onOutput?.("Isolated animation render complete\n");
      return;
    }
    throw new Error(
      "Modal rendering timed out; its receipt is retained so retry can resume the job",
    );
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
