import test from "node:test";
import assert from "node:assert/strict";
import { authoredPlan } from "../src/authored.js";
import { launchRenderer, openAuthoredPage } from "../src/render-browser.js";
const motion = {
  html: '<div id="dot"></div>',
  css: "#dot{position:absolute;top:100px;width:100px;height:100px;background:coral}",
  javascript:
    'window.renderFrame=(t)=>{document.querySelector("#dot").style.left=(t*50)+"px"};window.networkResult="pending";fetch("http://127.0.0.1:8789/api/projects").then(()=>window.networkResult="allowed",()=>window.networkResult="blocked");',
};
const plan = authoredPlan({
  title: "Original animation",
  summary: "Test",
  music: false,
  voice: "marin",
  presenterMode: "cutout",
  scenes: [{ title: "One", narration: "A moving dot." }],
  motion,
});
test("accepts original source without a visual-template selection and rejects off-canvas presenter placement", () => {
  assert.equal(plan.motion?.javascript, motion.javascript);
  assert.throws(() =>
    authoredPlan({
      ...plan,
      motion,
      presenterMode: "cutout",
      presenterPlacement: { x: 900, y: 1500, width: 500, height: 600 },
    }),
  );
});
test("isolates generated scripts from local APIs and renders backward seeks deterministically", async () => {
  const browser = await launchRenderer();
  try {
    const r = await openAuthoredPage(browser, {
      plan,
      scenes: [{ ...plan.scenes[0], start: 0, duration: 4, audio: "" }],
      duration: 4,
      captions: [],
    });
    await r.seek(1);
    const a = await r.page.screenshot();
    await r.seek(3);
    const b = await r.page.screenshot();
    await r.seek(1);
    const c = await r.page.screenshot();
    assert.deepEqual(a, c);
    assert.notDeepEqual(a, b);
    assert.equal(
      await r.page.evaluate(() => (window as any).networkResult),
      "blocked",
    );
    assert.equal(
      await r.page.evaluate(() => location.origin),
      "http://render.invalid",
    );
  } finally {
    await browser.close();
  }
});
