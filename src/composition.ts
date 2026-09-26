import { webVisual, webCss, webAnimation } from "./web-visual.js";
import type { Caption } from "./presenter.js";
import { escapeHtml as e, type Plan, type TimedScene } from "./schema.js";
const colors = {
  lime: "#d7fc70",
  coral: "#ff917c",
  blue: "#8cc9ff",
  violet: "#bba0ff",
};
function diagram(scene: TimedScene) {
  if (["web", "photo"].includes(scene.visual)) return webVisual(scene);
  const labels = scene.labels.map(e);
  if (scene.visual === "orbit")
    return `<div class="orbit"><div class="ring r1"></div><div class="ring r2"></div><div class="core">${labels[0]}</div>${labels
      .slice(1)
      .map((l, i) => `<div class="sat s${i}">${l}</div>`)
      .join("")}<div class="dot"></div></div>`;
  if (scene.visual === "comparison")
    return `<div class="comparison">${labels.map((l, i) => `<div class="tile"><span class="tile-index">${i === 0 ? "01" : "02"}</span><div class="symbol">${i === 0 ? "−" : "+"}</div><strong>${l}</strong></div>`).join("")}</div>`;
  if (scene.visual === "steps")
    return `<div class="steps">${labels.map((l, i) => `<div class="step"><b>${String(i + 1).padStart(2, "0")}</b><span>${l}</span></div>`).join("")}</div>`;
  if (scene.visual === "bars")
    return `<div class="bars">${labels.map((l, i) => `<div class="bar-item"><div>${l}</div><div class="bar-track"><div class="bar-fill" style="width:${scene.values[i]}%"></div></div></div>`).join("")}</div>`;
  return `<div class="statement">${labels.map((l, i) => `<div class="word word-${i}">${l}</div>`).join("")}</div>`;
}
function captions(scene: TimedScene, i: number) {
  const words = scene.narration.split(/\s+/);
  const chunks: string[] = [];
  for (let w = 0; w < words.length; w += 7)
    chunks.push(words.slice(w, w + 7).join(" "));
  return chunks
    .map((c, j) => `<div class="caption" id="cap-${i}-${j}">${e(c)}</div>`)
    .join("");
}
export function composition(
  plan: Plan,
  scenes: TimedScene[],
  duration: number,
  presenterCaptions?: Caption[],
) {
  const presenter = presenterCaptions !== undefined;
  const animations = scenes
    .map((s, i) => {
      const selector = `#scene-${i}`;
      const words = s.narration.split(/\s+/).length;
      const chunks = presenter ? 0 : Math.ceil(words / 7);
      return `${webAnimation(s, i)}tl.set('${selector}',{opacity:1},${s.start});
  tl.fromTo('${selector} h1',{y:65,opacity:0},{y:0,opacity:1,duration:.65,ease:'power3.out'},${s.start + 0.1});
  tl.fromTo('${selector} .visual',{y:80,scale:.92,opacity:0},{y:0,scale:1,opacity:1,duration:.8,ease:'power3.out'},${s.start + 0.25});
  tl.fromTo('${selector} .tile,${selector} .step,${selector} .word,${selector} .bar-item',{y:35,opacity:0},{y:0,opacity:1,duration:.55,stagger:.16},${s.start + 0.4});
  tl.fromTo('${selector} .bar-fill',{scaleX:0},{scaleX:1,duration:1.2,stagger:.2,ease:'power2.out'},${s.start + 0.65});
  tl.to('${selector} .ring',{rotation:50,duration:${s.duration},ease:'none'},${s.start});
  tl.fromTo('${selector} .dot',{rotation:0},{rotation:300,duration:${s.duration},ease:'none'},${s.start});
  ${Array.from({ length: chunks }, (_, j) => `tl.set('#cap-${i}-${j}',{opacity:1},${s.start + (j * (s.duration - 0.25)) / chunks});tl.set('#cap-${i}-${j}',{opacity:0},${s.start + ((j + 1) * (s.duration - 0.25)) / chunks});`).join("\n")}
  tl.to('${selector}',{opacity:0,duration:.2},${s.start + s.duration - 0.2});`;
    })
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(plan.title)}</title><script src="gsap.min.js"></script><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#121718;color:#f5f3e9;font-family:Arial,Helvetica,sans-serif}
#video{position:relative;width:1080px;height:1920px;overflow:hidden;background:#121718}.grid{position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:90px 90px}.topline{position:absolute;top:78px;left:78px;right:78px;display:flex;justify-content:space-between;font-size:25px;letter-spacing:5px;font-weight:700;color:#acb7ae}.brand-dot{color:#d7fc70}.scene{position:absolute;inset:0;opacity:0;padding:235px 78px 240px}.eyebrow{font-size:26px;letter-spacing:5px;color:var(--accent);margin-bottom:30px;text-transform:uppercase}h1{font-size:100px;line-height:1.04;letter-spacing:-5px;max-width:920px;margin:0;overflow-wrap:break-word}.visual{height:740px;margin-top:80px;display:flex;align-items:center;justify-content:center;position:relative}.orbit{width:670px;height:670px;position:relative}.ring{position:absolute;border:2px solid #ffffff35;border-radius:50%;inset:65px}.r2{inset:0;border-style:dashed}.core{position:absolute;inset:210px;border-radius:50%;background:var(--accent);color:#121718;display:flex;align-items:center;justify-content:center;text-align:center;padding:25px;font-size:42px;font-weight:700}.sat{position:absolute;background:#27312f;border:1px solid #718071;border-radius:60px;padding:22px 32px;font-size:32px;max-width:360px;text-align:center}.s0{top:15px;left:160px}.s1{bottom:75px;right:-30px}.s2{bottom:90px;left:-40px}.dot{position:absolute;inset:60px;border-radius:50%}.dot:after{content:'';position:absolute;width:25px;height:25px;top:-12px;left:50%;background:var(--accent);border-radius:50%}.comparison{display:flex;gap:25px;width:100%;flex-wrap:wrap}.tile{flex:1;min-width:330px;background:#202928;border:1px solid #45504a;padding:35px;border-radius:25px;min-height:400px}.tile:nth-child(2){background:var(--accent);color:#121718}.tile-index{font-size:25px;letter-spacing:4px;opacity:.65}.symbol{font-size:150px;line-height:1.2}.tile strong{font-size:43px;line-height:1.15}.steps{width:100%;display:grid;gap:25px}.step{background:#202928;border:1px solid #45504a;border-radius:20px;padding:32px;display:flex;align-items:center;gap:30px}.step b{font-size:58px;color:var(--accent)}.step span{font-size:42px}.bars{width:100%;display:grid;gap:45px;font-size:34px}.bar-track{height:75px;background:#26322e;margin-top:18px;border-radius:10px;overflow:hidden}.bar-fill{height:100%;background:var(--accent);transform-origin:left}.statement{width:100%;display:grid;gap:22px}.word{font-size:75px;line-height:1.1;font-weight:700;letter-spacing:-2px;border-bottom:1px solid #45504a;padding:22px 0}.word-0{color:var(--accent)}.caption{position:absolute;bottom:275px;left:80px;right:80px;text-align:center;font-size:43px;line-height:1.25;opacity:0;background:#121718e8;padding:16px 25px;border-radius:15px}.footer{position:absolute;bottom:140px;left:78px;right:78px;display:flex;justify-content:space-between;font-size:24px;letter-spacing:3px;color:#9da99e}.progress{position:absolute;bottom:100px;left:78px;width:924px;height:5px;background:#d7fc70;transform-origin:left}
${presenter ? `.scene{height:1080px;padding:130px 65px 0}.topline{top:40px;font-size:18px;letter-spacing:3px}.eyebrow{font-size:19px;margin-bottom:20px}h1{font-size:70px;letter-spacing:-3px}.visual{height:600px;margin-top:0}.orbit{transform:scale(.72)}.step{padding:20px}.step b{font-size:42px}.step span{font-size:34px}.steps{gap:14px}.word{font-size:49px;padding:15px 0}.caption{top:935px;bottom:auto;font-size:33px;padding:10px 20px;left:50px;right:50px}.tile{min-height:320px}.tile strong{font-size:36px}.symbol{font-size:90px}.footer{display:none}.progress{top:1074px;bottom:auto}` : ""}
${webCss}
</style></head><body><div id="video" data-composition-id="explainer" data-width="1080" data-height="1920" data-duration="${duration}" data-fps="30"><div class="grid"></div><div class="topline"><span><span class="brand-dot">●</span> EDUCATIVE YAP</span><span>SMALL VIDEO. BIG IDEA.</span></div>
${scenes.map((s, i) => `<section class="scene" id="scene-${i}" style="--accent:${colors[s.accent]}"><div class="eyebrow">${String(i + 1).padStart(2, "0")} / ${String(scenes.length).padStart(2, "0")} — ${i === 0 ? "The question" : i === scenes.length - 1 ? "The takeaway" : "The explanation"}</div><h1>${e(s.title)}</h1><div class="visual">${diagram(s)}</div>${presenter ? "" : captions(s, i)}</section>${s.audio ? `<audio src="${s.audio}" data-start="${s.start}" data-duration="${s.duration - 0.25}" data-track-index="${i + 1}"></audio>` : ""}`).join("\n")}
${(presenterCaptions || []).map((c, i) => `<div class="caption" id="pcap-${i}">${e(c.text)}</div>`).join("")}
<div class="footer"><span>EXPLAINED IN UNDER A MINUTE</span><span>AI NARRATION</span></div><div class="progress"></div></div><script>gsap.config({nullTargetWarn:false});const tl=gsap.timeline({paused:true});${animations}${(presenterCaptions || []).map((c, i) => `tl.set("#pcap-${i}",{opacity:1},${c.start});tl.set("#pcap-${i}",{opacity:0},${c.end});`).join("")}tl.fromTo('.progress',{scaleX:0},{scaleX:1,duration:${duration},ease:'none'},0);window.__timelines={explainer:tl};</script></body></html>`;
}
