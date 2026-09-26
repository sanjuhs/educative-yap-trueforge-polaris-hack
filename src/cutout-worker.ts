import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { launchRenderer } from "./render-browser.js";
import { config } from "./config.js";
const dir = path.resolve(process.argv[2]),
  duration = Number(process.argv[3]);
const browser = await launchRenderer();
try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const origin = "http://segmentation.invalid";
  const resources = new Map<string, { file: string; type: string }>([
    [
      "/vision.mjs",
      {
        file: path.join(
          config.root,
          "node_modules/@mediapipe/tasks-vision/vision_bundle.mjs",
        ),
        type: "application/javascript",
      },
    ],
    [
      "/model.tflite",
      {
        file: path.join(config.data, "models/selfie_multiclass.tflite"),
        type: "application/octet-stream",
      },
    ],
    [
      "/video.mp4",
      { file: path.join(dir, "person-source-v1.mp4"), type: "video/mp4" },
    ],
  ]);
  for (const file of await fs.readdir(
    path.join(config.root, "node_modules/@mediapipe/tasks-vision/wasm"),
  ))
    if (/\.(wasm|js)$/.test(file))
      resources.set("/wasm/" + file, {
        file: path.join(
          config.root,
          "node_modules/@mediapipe/tasks-vision/wasm",
          file,
        ),
        type: file.endsWith(".wasm")
          ? "application/wasm"
          : "application/javascript",
      });
  const page = await context.newPage();
  const html = `<!doctype html><video id="v" src="/video.mp4" muted preload="auto"></video><canvas id="c"></canvas><script type="module">
 import {ImageSegmenter,FilesetResolver} from '/vision.mjs';
 const v=document.querySelector('video'),c=document.querySelector('canvas');
 window.ready=(async()=>{const files=await FilesetResolver.forVisionTasks('/wasm');window.segmenter=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:'/model.tflite',delegate:'CPU'},runningMode:'VIDEO',outputConfidenceMasks:true,outputCategoryMask:false});if(v.readyState<2) await new Promise(r=>v.onloadeddata=r);return true;})();
 window.maskFrame=async(t)=>{await window.ready;if(Math.abs(v.currentTime-t)>.0001){await new Promise((resolve,reject)=>{v.onseeked=resolve;v.onerror=reject;v.currentTime=t;});} const result=window.segmenter.segmentForVideo(v,t*1000);const mask=result.confidenceMasks[0],data=mask.getAsFloat32Array();c.width=mask.width;c.height=mask.height;const ctx=c.getContext('2d'),pixels=ctx.createImageData(c.width,c.height);for(let i=0;i<data.length;i++){let x=Math.max(0,Math.min(1,((1-data[i])-.35)/.5));x=x*x*(3-2*x);const n=Math.round(x*255);pixels.data[i*4]=n;pixels.data[i*4+1]=n;pixels.data[i*4+2]=n;pixels.data[i*4+3]=255;}ctx.putImageData(pixels,0,0);result.close();return c.toDataURL('image/png').split(',')[1];};
 </script>`;
  await context.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) return route.abort();
    if (u.pathname === "/")
      return route.fulfill({ body: html, contentType: "text/html" });
    const r = resources.get(u.pathname);
    if (!r) return route.abort();
    return route.fulfill({
      body: await fs.readFile(r.file),
      contentType: r.type,
    });
  });
  page.on("pageerror", (e) => console.error(e.message));
  await page.goto(origin);
  await page.evaluate(() => (window as any).ready);
  const encoder = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      "15",
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "12",
      "-pix_fmt",
      "yuv420p",
      path.join(dir, "person-mask-v1.pending.mp4"),
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let error = "";
  encoder.stderr.on("data", (b) => (error += b));
  const done = new Promise<void>((resolve, reject) => {
    encoder.on("error", reject);
    encoder.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(error))));
  });
  void done.catch(() => {});
  try {
    const frames = Math.ceil(duration * 15);
    for (let f = 0; f < frames; f++) {
      const b64 = await page.evaluate(
        (t) => (window as any).maskFrame(t),
        f / 15,
      );
      await new Promise<void>((resolve, reject) =>
        encoder.stdin.write(Buffer.from(b64, "base64"), (e) =>
          e ? reject(e) : resolve(),
        ),
      );
      if (f % 45 === 0)
        console.log(
          "Removing background " + Math.round((f / frames) * 100) + "%",
        );
    }
    encoder.stdin.end();
    await done;
  } finally {
    if (encoder.exitCode === null) encoder.kill("SIGKILL");
  }
} finally {
  await browser.close();
}
