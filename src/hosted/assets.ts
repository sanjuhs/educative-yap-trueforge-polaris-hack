import fs from "node:fs/promises";
import path from "node:path";
import { hosted, currentOwner, assertResource } from "./integrations.js";
import { visualAssetPath } from "../visual-assets.js";
import { clipDir } from "../video-clips.js";
import { presenterDir } from "../presenter.js";
import { run, rendererEnv } from "../process.js";

type AssetKind = "image" | "clip" | "presenter";
export async function persistSourceAsset(
  kind: AssetKind,
  metadata: { id: string; [key: string]: unknown },
) {
  if (!hosted) return;
  const owner = currentOwner();
  if (!owner) throw new Error("An authenticated owner is required");
  const id = metadata.id,
    files: Record<string, string> = {};
  if (kind === "image") {
    files.image = await hosted.storage.putFile(
      owner,
      id,
      "image",
      visualAssetPath(id),
      String(metadata.contentType || "application/octet-stream"),
    );
    files["asset.json"] = await hosted.storage.putJson(
      owner,
      id,
      "asset.json",
      metadata,
    );
  } else {
    const dir = kind === "clip" ? clipDir(id) : presenterDir(id);
    const names =
      kind === "clip"
        ? ["clip.mp4", "clip.json"]
        : ["original-video", "voice.wav", "asset.json"];
    for (const name of names)
      files[name] = await hosted.storage.putFile(
        owner,
        id,
        name,
        path.join(dir, name),
        name.endsWith(".json")
          ? "application/json"
          : name.endsWith(".wav")
            ? "audio/wav"
            : "video/mp4",
      );
  }
  await hosted.store.saveAsset(
    owner,
    id,
    kind,
    { ...metadata, files },
    kind === "image"
      ? files.image
      : kind === "clip"
        ? files["clip.mp4"]
        : files["original-video"],
  );
}
export async function ensureSourceAsset(kind: AssetKind, id: string) {
  if (!hosted) return;
  await assertResource(kind, id);
  const owner = currentOwner()!,
    asset = await hosted.store.getAsset(owner, id),
    files = asset.metadata.files as Record<string, string> | undefined;
  if (!files) return; // Legacy imports live on the persistent media volume.
  const restore = async (name: string, target: string) => {
    try {
      await fs.access(target);
    } catch {
      if (!files[name]) throw new Error("Saved source asset is unavailable");
      await hosted!.storage.downloadFile(owner, files[name], target);
    }
  };
  if (kind === "image") {
    await restore("image", visualAssetPath(id));
    await restore("asset.json", visualAssetPath(id) + ".json");
  } else if (kind === "presenter") {
    for (const name of ["original-video", "voice.wav", "asset.json"])
      await restore(name, path.join(presenterDir(id), name));
  } else {
    const dir = clipDir(id);
    await restore("clip.mp4", path.join(dir, "clip.mp4"));
    await restore("clip.json", path.join(dir, "clip.json"));
    try {
      await fs.access(path.join(dir, "frame-000.jpg"));
    } catch {
      await run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-i",
          path.join(dir, "clip.mp4"),
          "-an",
          "-q:v",
          "3",
          "-start_number",
          "0",
          path.join(dir, "frame-%03d.jpg"),
        ],
        { timeout: 60000, env: rendererEnv() },
      );
    }
  }
}
