import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  launchRenderer,
  openAuthoredPage,
  type RenderInput,
} from "./render-browser.js";

const dir = path.resolve(process.argv[2]),
  input: RenderInput = JSON.parse(
    await fs.readFile(path.join(dir, "render-input.json"), "utf8"),
  );
const browser = await launchRenderer();
try {
  const { page, seek, blocked } = await openAuthoredPage(browser, input);
  if (input.preview) {
    const frames: Buffer[] = [];
    const times = [
      Math.min(1.8, input.duration * 0.1),
      input.duration * 0.48,
      input.duration * 0.82,
    ];
    for (const [i, t] of times.entries()) {
      await seek(t);
      frames.push(
        await page.screenshot({
          path: path.join(dir, `preview-${i}.png`),
          type: "png",
        }),
      );
    }
    // Seek backwards too: generated animations must not depend on playback history.
    await seek(times[0]);
    const repeated = await page.screenshot({ type: "png" });
    if (!frames[0].equals(repeated))
      throw new Error(
        "Non-deterministic animation: returning to the same time changed the frame. Reset all visual state or seek a paused timeline.",
      );
    await fs.writeFile(
      path.join(dir, "preview.json"),
      JSON.stringify({
        ok: true,
        times,
        blocked,
        notes:
          "Preview uses actual presenter timings, or estimated 6s/scene for TTS. Background frames shown; cutout is composited during export.",
      }),
    );
  } else {
    const encoder = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-f",
        "image2pipe",
        "-framerate",
        "30",
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        path.join(dir, "render.mp4"),
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let log = "";
    encoder.stderr.on("data", (b) => (log = (log + b).slice(-2000)));
    const done = new Promise<void>((resolve, reject) => {
      encoder.on("error", reject);
      encoder.on("exit", (c) =>
        c === 0 ? resolve() : reject(new Error("Encoder: " + log)),
      );
    });
    void done.catch(() => {});
    try {
      const count = Math.ceil(input.duration * 30);
      for (let frame = 0; frame < count; frame++) {
        await seek(frame / 30);
        const bytes = await page.screenshot({
          type: "jpeg",
          quality: 93,
          animations: "allow",
        });
        await new Promise<void>((resolve, reject) =>
          encoder.stdin.write(bytes, (err) => (err ? reject(err) : resolve())),
        );
        if (frame % 90 === 0)
          console.log(
            `Authored animation ${Math.round((frame / count) * 100)}%`,
          );
      }
      encoder.stdin.end();
      await done;
    } finally {
      if (encoder.exitCode === null) encoder.kill("SIGKILL");
    }
  }
} finally {
  await browser.close();
}
