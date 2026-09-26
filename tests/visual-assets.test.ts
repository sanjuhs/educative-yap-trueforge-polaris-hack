import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { config } from "../src/config.js";
import { visualAssetPath } from "../src/visual-assets.js";
import { authoredPlan } from "../src/authored.js";
import { launchRenderer, openAuthoredPage } from "../src/render-browser.js";

test("imported images load only when declared; source credits survive rendering", async () => {
  const id = randomBytes(32).toString("hex"),
    file = visualAssetPath(id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.copyFile(path.join(config.root, "assets/cafe.png"), file);
  await fs.writeFile(
    file + ".json",
    JSON.stringify({
      id,
      title: "Fixture",
      creator: "Test creator",
      sourceUrl: "https://example.com/source",
      imageUrl: "https://example.com/image",
      license: "Unknown",
      licenseUrl: "",
      permissionStatus: "not-reviewed",
      retrievedAt: new Date().toISOString(),
      contentType: "image/png",
    }),
  );
  const browser = await launchRenderer();
  try {
    const plan = authoredPlan({
      title: "Imported asset",
      summary: "Test",
      voice: "marin",
      music: false,
      presenterMode: "cutout",
      visualAssetIds: [id],
      scenes: [{ title: "Photo", narration: "A photo." }],
      motion: {
        html: `<img id="photo" src="visual-${id}"><img id="blocked" src="visual-${"b".repeat(64)}">`,
        css: "#photo{width:300px}",
        javascript: "window.renderFrame=()=>{}",
      },
    });
    const r = await openAuthoredPage(browser, {
      plan,
      scenes: [{ ...plan.scenes[0], start: 0, duration: 4, audio: "" }],
      duration: 4,
      captions: [],
    });
    await r.seek(1);
    assert.ok(
      await r.page
        .locator("#photo")
        .evaluate((img: HTMLImageElement) => img.naturalWidth > 0),
    );
    assert.equal(
      await r.page
        .locator("#blocked")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
      0,
    );
    assert.match(
      await r.page.locator("#host-image-credits").innerText(),
      /Test creator/,
    );
    assert.throws(() => visualAssetPath("../../.env"));
  } finally {
    await browser.close();
    await fs.rm(file, { force: true });
    await fs.rm(file + ".json", { force: true });
  }
});
