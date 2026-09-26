import { clipDir, readClip } from "./video-clips.js";
import { chromium, type Browser } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { Plan, TimedScene } from "./schema.js";
import type { Caption } from "./presenter.js";
import { readVisualAsset, visualAssetPath } from "./visual-assets.js";

export type RenderInput = {
  plan: Plan;
  scenes: TimedScene[];
  duration: number;
  captions: Caption[];
  preview?: boolean;
};
export const renderOrigin = "http://render.invalid";
export const renderCsp =
  "default-src 'none'; script-src 'unsafe-inline' http://render.invalid/gsap.min.js; style-src 'unsafe-inline'; img-src data: http://render.invalid/cafe.png; connect-src 'none'; font-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts";
export async function launchRenderer(): Promise<Browser> {
  const env = { ...process.env };
  for (const k of Object.keys(env))
    if (/KEY|TOKEN|SECRET|PASSWORD/.test(k)) delete env[k];
  return chromium.launch({
    headless: true,
    env,
    args: [
      "--disable-dev-shm-usage",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
  });
}
export function authoredHtml(input: RenderInput) {
  const m = input.plan.motion!;
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#111}#artboard{position:relative;width:1080px;height:1920px;overflow:hidden}${m.css}</style><script src="/gsap.min.js"></script></head><body><div id="artboard">${m.html}</div><script>${m.javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
}
export async function openAuthoredPage(browser: Browser, input: RenderInput) {
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  const html = authoredHtml(input);
  const resources = new Map<
    string,
    { body: Buffer | string; contentType: string }
  >([
    ["/index.html", { body: html, contentType: "text/html" }],
    [
      "/gsap.min.js",
      {
        body: await fs.readFile(
          path.join(config.root, "node_modules/gsap/dist/gsap.min.js"),
        ),
        contentType: "application/javascript",
      },
    ],
    [
      "/cafe.png",
      {
        body: await fs.readFile(path.join(config.root, "assets/cafe.png")),
        contentType: "image/png",
      },
    ],
  ]);
  const visualAssets = await Promise.all(
    (input.plan.visualAssetIds || []).map(readVisualAsset),
  );
  for (const asset of visualAssets)
    resources.set(`/visual-${asset.id}`, {
      body: await fs.readFile(visualAssetPath(asset.id)),
      contentType: asset.contentType,
    });
  const clips = await Promise.all(
    (input.plan.clipAssetIds || []).map(readClip),
  );
  const clipMap = new Map(clips.map((c) => [c.id, c]));
  const csp = renderCsp.replace(
    "img-src data: http://render.invalid/cafe.png;",
    `img-src data: http://render.invalid/cafe.png ${visualAssets.map((a) => `${renderOrigin}/visual-${a.id}`).join(" ")} ${clips.map((c) => `${renderOrigin}/clip-${c.id}/`).join(" ")};`,
  );
  const blocked: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url()),
      resource =
        url.origin === renderOrigin ? resources.get(url.pathname) : undefined;
    const clipFrame = url.pathname.match(
      /^\/clip-([a-f0-9-]{36})\/frame-(\d{3})\.jpg$/,
    );
    if (
      url.origin === renderOrigin &&
      clipFrame &&
      route.request().method() === "GET"
    ) {
      const clip = clipMap.get(clipFrame[1]);
      if (clip && Number(clipFrame[2]) < clip.frameCount) {
        return route.fulfill({
          body: await fs.readFile(
            path.join(clipDir(clip.id), `frame-${clipFrame[2]}.jpg`),
          ),
          contentType: "image/jpeg",
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
    }
    if (!resource || route.request().method() !== "GET") {
      blocked.push(url.origin + url.pathname);
      return route.abort();
    }
    return route.fulfill({
      ...resource,
      headers: {
        "Content-Security-Policy": csp,
        "Access-Control-Allow-Origin": "*",
      },
    });
  });
  await context.routeWebSocket("**/*", (ws) => ws.close());
  await context.addInitScript(() => {
    Object.defineProperty(window, "RTCPeerConnection", { value: undefined });
    Object.defineProperty(window, "webkitRTCPeerConnection", {
      value: undefined,
    });
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("dialog", (dialog) => void dialog.dismiss());
  await page.goto(renderOrigin + "/index.html", {
    waitUntil: "load",
    timeout: 15000,
  });
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images).map((i) => i.decode().catch(() => {})),
    );
  });
  if (visualAssets.length)
    await page.evaluate((assets) => {
      const el = document.createElement("div");
      el.id = "host-image-credits";
      el.style.cssText =
        "position:fixed;bottom:24px;left:45px;right:45px;z-index:2147483647;color:#eee;background:#080c12d9;padding:9px 15px;font:28px/1.3 Arial;text-align:center;border-radius:8px";
      const creators = [
        ...new Set(assets.map((a) => a.creator.split(";")[0])),
      ].join(" · ");
      el.textContent =
        "Images: " +
        (creators.length > 45 ? creators.slice(0, 42) + "…" : creators) +
        " · Full credits attached";
      document.body.append(el);
    }, visualAssets);
  await page.evaluate((clips) => {
    for (const el of document.querySelectorAll<HTMLImageElement>(
      "img[data-clip-id]",
    )) {
      if (!clips.some((c) => c.id === el.dataset.clipId))
        throw new Error("Declare every clip image ID in clipAssetIds.");
      el.style.visibility = "hidden";
    }
  }, clips);
  const valid = await page.evaluate(
    () => typeof (window as any).renderFrame === "function",
  );
  if (!valid || errors.length) {
    await context.close();
    throw new Error(
      "Authored design failed: " +
        (errors.join("; ") ||
          "Define window.renderFrame(time,duration,scenes)."),
    );
  }
  // Host-owned caption layer lives outside the design, above any ordinary z-index.
  await page.evaluate(() => {
    const c = document.createElement("div");
    c.id = "host-captions";
    c.style.cssText =
      "position:fixed;bottom:90px;left:70px;right:70px;z-index:2147483647;pointer-events:none;text-align:center;font:600 37px/1.25 Arial;color:white;text-shadow:0 2px 6px black;background:#111b;padding:12px 20px;border-radius:16px;display:none";
    document.body.append(c);
  });
  async function seek(time: number) {
    await page.evaluate(
      async ({ time, duration, scenes, captions, clips }) => {
        (window as any).renderFrame(time, duration, scenes);
        await Promise.all(
          Array.from(
            document.querySelectorAll<HTMLImageElement>("img[data-clip-id]"),
          ).map(async (el) => {
            const clip = clips.find((c) => c.id === el.dataset.clipId);
            const index = Number(el.dataset.scene || "0"),
              offset = Number(el.dataset.offset || "0");
            if (
              !clip ||
              !Number.isInteger(index) ||
              !scenes[index] ||
              !Number.isFinite(offset) ||
              offset < 0
            )
              throw new Error(
                "Invalid clip placement: use a declared ID, valid data-scene and nonnegative data-offset.",
              );
            const local = time - scenes[index].start - offset;
            const active =
              local >= 0 &&
              local < Math.min(clip.duration, scenes[index].duration - offset);
            el.style.visibility = active ? "visible" : "hidden";
            if (!active) return;
            const frame = Math.min(
              clip.frameCount - 1,
              Math.floor(local * clip.fps + 1e-7),
            );
            const src = `/clip-${clip.id}/frame-${String(frame).padStart(3, "0")}.jpg`;
            if (el.getAttribute("src") !== src) el.setAttribute("src", src);
            await el.decode();
          }),
        );
        const caption = captions.find((c) => time >= c.start && time < c.end),
          el = document.getElementById("host-captions")!;
        el.textContent = caption?.text || "";
        el.style.display = caption ? "block" : "none";
        const credits = document.getElementById("host-image-credits");
        el.style.bottom = `${credits ? Math.max(90, 1920 - credits.getBoundingClientRect().top + 20) : 90}px`;
      },
      {
        time,
        duration: input.duration,
        scenes: input.scenes,
        captions: input.captions,
        clips,
      },
    );
    if (errors.length) throw new Error(errors.join("; ").slice(0, 1500));
  }
  return { page, context, seek, errors, blocked };
}
