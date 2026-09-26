import { chromium, type Browser } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { Plan, TimedScene } from "./schema.js";
import type { Caption } from "./presenter.js";

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
  const blocked: string[] = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url()),
      resource =
        url.origin === renderOrigin ? resources.get(url.pathname) : undefined;
    if (!resource || route.request().method() !== "GET") {
      blocked.push(url.origin + url.pathname);
      return route.abort();
    }
    return route.fulfill({
      ...resource,
      headers: {
        "Content-Security-Policy": renderCsp,
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
      ({ time, duration, scenes, captions }) => {
        (window as any).renderFrame(time, duration, scenes);
        const caption = captions.find((c) => time >= c.start && time < c.end),
          el = document.getElementById("host-captions")!;
        el.textContent = caption?.text || "";
        el.style.display = caption ? "block" : "none";
      },
      {
        time,
        duration: input.duration,
        scenes: input.scenes,
        captions: input.captions,
      },
    );
    if (errors.length) throw new Error(errors.join("; ").slice(0, 1500));
  }
  return { page, context, seek, errors, blocked };
}
