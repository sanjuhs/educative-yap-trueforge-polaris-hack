import test from "node:test";
import assert from "node:assert/strict";
import { authoredPlan } from "../src/authored.js";
import { launchRenderer, openAuthoredPage } from "../src/render-browser.js";

const plan = authoredPlan({
  title: "Photo movement",
  summary: "Deterministic still-photo motion",
  voice: "marin",
  music: false,
  presenterMode: "cutout",
  scenes: [
    { title: "Intro", narration: "First." },
    { title: "Photo", narration: "Then a moving photo." },
  ],
  motion: {
    html: `<section data-scene="1">
      ${["zoom-in", "zoom-out", "pan-left", "pan-right"].map((mode, i) => `<img id="photo-${i}" src="cafe.png" data-photo-motion="${mode}">`).join("")}
      <div id="label">A stable label</div>
      <img id="exact" src="cafe.png" data-photo-motion="none">
      <svg width="20" height="20"><rect width="20" height="20" fill="white"/></svg>
    </section><img id="legacy" src="cafe.png">`,
    css: `section{display:grid;grid-template-columns:400px 400px;gap:20px;padding:40px}img{width:400px;height:300px;object-fit:cover;border-radius:20px}#label{position:absolute;top:80px;left:80px;color:white;font:32px Arial}#exact,#legacy{width:200px;height:150px}`,
    javascript: `window.renderFrame=()=>{document.querySelector('#photo-0').style.transform='translateY(5px)';}`,
  },
});
const scenes = plan.scenes.map((s, i) => ({
  ...s,
  start: i * 2,
  duration: 2,
  audio: "",
}));

test("photo zooms/pans change pixels inside stable frames and survive backwards seeks", async () => {
  const browser = await launchRenderer();
  try {
    const r = await openAuthoredPage(browser, {
      plan,
      scenes,
      duration: 4,
      captions: [{ start: 0, end: 4, text: "A stable caption" }],
    });
    await r.seek(2);
    const first = await r.page.screenshot();
    const boxes = await r.page
      .locator("section img, #label, #host-captions")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getBoundingClientRect().toJSON()),
      );
    const photos = await Promise.all(
      [0, 1, 2, 3].map((i) => r.page.locator(`#photo-${i}`).screenshot()),
    );
    const exact = await r.page.locator("#exact").screenshot();
    const caption = await r.page.locator("#host-captions").screenshot();
    await r.seek(3.9);
    for (const [i, start] of photos.entries())
      assert.notDeepEqual(
        await r.page.locator(`#photo-${i}`).screenshot(),
        start,
        `mode ${i} must visibly move`,
      );
    assert.deepEqual(await r.page.locator("#exact").screenshot(), exact);
    assert.deepEqual(
      await r.page.locator("#host-captions").screenshot(),
      caption,
    );
    assert.deepEqual(
      await r.page
        .locator("section img, #label, #host-captions")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getBoundingClientRect().toJSON()),
        ),
      boxes,
    );
    assert.equal(
      await r.page
        .locator("#photo-0")
        .evaluate((img: HTMLElement) => img.style.transform),
      "translateY(5px)",
    );
    await r.seek(2);
    assert.deepEqual(
      await r.page.screenshot(),
      first,
      "backwards seeks reproduce the exact frame",
    );
    await r.seek(3);
    assert.equal(
      await r.page
        .locator("#photo-0")
        .evaluate((img: HTMLElement) =>
          img.style.getPropertyValue("object-view-box"),
        ),
      "inset(2.25%)",
    );
    // No scene metadata: legacy photos still move over the full video duration.
    assert.match(
      await r.page
        .locator("#legacy")
        .evaluate((img: HTMLElement) =>
          img.style.getPropertyValue("object-view-box"),
        ),
      /^inset\(/,
    );
    await r.context.close();
  } finally {
    await browser.close();
  }
});

test("photo offsets clamp to shot bounds; invalid placements fail and footage is excluded", async () => {
  const browser = await launchRenderer();
  try {
    const r = await openAuthoredPage(browser, {
      plan,
      scenes,
      duration: 4,
      captions: [],
    });
    await r.page
      .locator("#photo-0")
      .evaluate((img: HTMLElement) => (img.dataset.offset = "1"));
    await r.seek(2.5);
    const crop = () =>
      r.page
        .locator("#photo-0")
        .evaluate((img: HTMLElement) =>
          img.style.getPropertyValue("object-view-box"),
        );
    assert.equal(await crop(), "inset(0.5%)");
    await r.seek(4);
    assert.equal(await crop(), "inset(4%)");
    await r.page
      .locator("#photo-0")
      .evaluate((img: HTMLElement) => (img.dataset.photoMotion = "none"));
    await r.seek(3);
    assert.equal(
      await crop(),
      "none",
      "opting out clears a previous animated crop",
    );
    await r.page
      .locator("#photo-0")
      .evaluate((img: HTMLElement) => (img.dataset.photoMotion = "zoom-in"));
    // Simulate a host-managed clip frame on an image after the seek. The motion
    // pass alone must leave its pixels untouched, even if it is a raster source.
    await r.page.locator("#exact").evaluate((img: HTMLElement) => {
      img.dataset.clipId = "clip";
      delete img.dataset.photoMotion;
    });
    const { applyPhotoMotion } = await import("../src/photo-motion.js");
    await r.page.evaluate(applyPhotoMotion, { time: 3, duration: 4, scenes });
    assert.equal(
      await r.page
        .locator("#exact")
        .evaluate((img: HTMLElement) =>
          img.style.getPropertyValue("object-view-box"),
        ),
      "none",
    );
    await r.page
      .locator("#exact")
      .evaluate((img: HTMLElement) => delete img.dataset.clipId);
    await r.page
      .locator("#photo-0")
      .evaluate((img: HTMLElement) => (img.dataset.scene = "99"));
    await assert.rejects(r.seek(3), /Invalid photo placement/);
    await r.context.close();
  } finally {
    await browser.close();
  }
});
