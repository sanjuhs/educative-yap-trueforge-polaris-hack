import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  normalizeUploadedAsset,
  rasterType,
  parseClipTrimRanges,
} from "../src/upload-library.js";
import { config } from "../src/config.js";
import { run } from "../src/process.js";
import { readVisualAsset, visualAssetPath } from "../src/visual-assets.js";
import { readClip, clipDir, clipCredits } from "../src/video-clips.js";

test("upload rejects SVG bytes and unsupported file types", async () => {
  assert.equal(
    rasterType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    undefined,
  );
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yap-upload-test-"));
  try {
    const file = path.join(dir, "x.svg");
    await fs.writeFile(file, "<svg></svg>");
    await assert.rejects(
      normalizeUploadedAsset({
        path: file,
        originalname: "x.svg",
        mimetype: "image/svg+xml",
      }),
      /Choose a PNG/,
    );
    await fs.writeFile(file, "#EXTM3U\n#EXTINF:4,\n/etc/passwd\n");
    await assert.rejects(
      normalizeUploadedAsset({
        path: file,
        originalname: "fake.mp4",
        mimetype: "video/mp4",
      }),
      /Choose a PNG/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("uploaded screenshot normalizes to owner-scoped PNG metadata", async () => {
  const owner = `test-${Date.now()}`;
  const asset = await normalizeUploadedAsset(
    {
      path: path.join(config.root, "assets/cafe.png"),
      originalname: "My screenshot.png",
      mimetype: "image/png",
    },
    { description: "Explain this UI", tags: ["screenshot"] },
    owner,
  );
  try {
    assert.equal(asset.kind, "image");
    assert.equal(asset.permissionStatus, "user-provided");
    const saved = await readVisualAsset(asset.id);
    assert.equal(saved.description, "Explain this UI");
    assert.equal(saved.sourceType, "upload");
    assert.equal(
      rasterType(await fs.readFile(visualAssetPath(asset.id))),
      "image/png",
    );
  } finally {
    await fs.rm(visualAssetPath(asset.id), { force: true });
    await fs.rm(visualAssetPath(asset.id) + ".json", { force: true });
  }
});

test("uploaded clip produces playable muted footage and deterministic 30fps frames", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yap-upload-test-"));
  let assetId: string | undefined;
  try {
    const source = path.join(dir, "sample.mp4");
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x120:rate=30",
      "-t",
      "3.4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      source,
    ]);
    const asset = await normalizeUploadedAsset(
      { path: source, originalname: "Sample.mp4", mimetype: "video/mp4" },
      { description: "An uploaded demo clip" },
    );
    assetId = asset.id;
    assert.equal(asset.kind, "clip");
    const clip = await readClip(asset.id);
    assert.equal(clip.sourceType, "upload");
    assert.equal(clip.permissionStatus, "user-provided");
    assert.equal(clip.frameCount, 102);
    assert.ok(clip.duration >= 3.3 && clip.duration <= 3.5);
    assert.match(clipCredits([clip]), /User-uploaded/);
    assert.doesNotMatch(clipCredits([clip]), /Permission: pending/);
    assert.ok(
      (await fs.stat(path.join(clipDir(asset.id), "frame-101.jpg"))).size > 0,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    if (assetId)
      await fs.rm(clipDir(assetId), { recursive: true, force: true });
  }
});

test("per-file clip selections reject duplicate indices, invalid ranges and malformed input", () => {
  const selected = parseClipTrimRanges(
    JSON.stringify([{ fileIndex: 1, startSeconds: 6.2, durationSeconds: 3.5 }]),
    2,
  );
  assert.deepEqual(selected.get(1), {
    fileIndex: 1,
    startSeconds: 6.2,
    durationSeconds: 3.5,
  });
  assert.equal(parseClipTrimRanges(undefined, 2).size, 0);
  assert.throws(() => parseClipTrimRanges("invalid", 1), /valid JSON/);
  assert.throws(
    () =>
      parseClipTrimRanges(
        [{ fileIndex: 2, startSeconds: 0, durationSeconds: 3 }],
        2,
      ),
    /unique uploaded file/,
  );
  assert.throws(
    () =>
      parseClipTrimRanges(
        [
          { fileIndex: 0, startSeconds: 0, durationSeconds: 3 },
          { fileIndex: 0, startSeconds: 2, durationSeconds: 3 },
        ],
        1,
      ),
    /unique uploaded file/,
  );
  assert.throws(() =>
    parseClipTrimRanges(
      [{ fileIndex: 0, startSeconds: -1, durationSeconds: 3 }],
      1,
    ),
  );
  assert.throws(() =>
    parseClipTrimRanges(
      [{ fileIndex: 0, startSeconds: 0, durationSeconds: 6 }],
      1,
    ),
  );
});

test("selected excerpt starts at the chosen source timestamp and rejects past-end selections", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yap-trim-test-"));
  let assetId: string | undefined;
  try {
    const source = path.join(dir, "two-colors.mp4");
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=red:s=160x120:r=30:d=4",
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=160x120:r=30:d=6",
      "-filter_complex",
      "[0:v][1:v]concat=n=2:v=1:a=0",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      source,
    ]);
    const input = {
      path: source,
      originalname: "Colors.mp4",
      mimetype: "video/mp4",
    };
    await assert.rejects(
      normalizeUploadedAsset(input, { startSeconds: 8, durationSeconds: 4 }),
      /beyond the end/,
    );
    const asset = await normalizeUploadedAsset(input, {
      startSeconds: 6,
      durationSeconds: 3,
      description: "Blue segment",
    });
    assetId = asset.id;
    const clip = await readClip(asset.id);
    assert.equal(clip.sourceStart, 6);
    assert.equal(clip.sourceEnd, 9);
    assert.equal(clip.frameCount, 90);
    const pixel = path.join(dir, "pixel.rgb");
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      path.join(clipDir(asset.id), "frame-000.jpg"),
      "-frames:v",
      "1",
      "-vf",
      "scale=1:1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      pixel,
    ]);
    const rgb = await fs.readFile(pixel);
    assert.ok(
      rgb[2] > 200 && rgb[0] < 30,
      "The selected clip must start in the blue section, not at the red beginning",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    if (assetId)
      await fs.rm(clipDir(assetId), { recursive: true, force: true });
  }
});
