import { escapeHtml as e, type TimedScene } from "./schema.js";

const code: Record<string, string[]> = {
  overview: ["HTML", "CSS", "JavaScript"],
  markup: [
    "<html>",
    '  <div class="card">',
    "    <h1>Daylight Café</h1>",
    "    <p>Good mornings start here.</p>",
    "  </div>",
    "</html>",
  ],
  render: [
    "<h1>Daylight Café</h1>",
    '<img src="coffee.jpg">',
    "<p>Good mornings start here.</p>",
  ],
  style: [
    ".card {",
    "  background: #fff3df;",
    "  border-radius: 24px;",
    "  padding: 24px;",
    "}",
  ],
  selector: [".card h1 {", "  color: #ba4e20;", "  font-size: 48px;", "}"],
  link: [
    "<head>",
    '  <link rel="stylesheet"',
    '        href="style.css">',
    "</head>",
  ],
  delivery: ["index.html", "+ style.css", "→ browser"],
};
export function webVisual(s: TimedScene) {
  if (s.visual === "photo")
    return `<div class="photo-panel"><img class="cafe-photo" src="cafe.png"><span>${e(s.labels[0])}</span></div>`;
  const stage = s.webStage || "render";
  if (stage === "overview")
    return `<div class="web-demo overview"><div class="tech-card html-card"><b>HTML</b><div class="mini-blocks"><i></i><i></i><i></i></div><small>Structure</small></div><div class="tech-card css-card"><b>CSS</b><div class="swatches"><i></i><i></i><i></i></div><small>Style</small></div><div class="tech-card js-card"><b>JS</b><div class="toggle"><i></i></div><small>Interaction</small></div></div>`;
  return `<div class="web-demo stage-${stage}"><div class="editor"><div class="editor-title">${stage === "style" || stage === "selector" ? "style.css" : "index.html"}</div><div class="code-lines">${code[stage].map((l) => `<div class="code-line">${e(l)}</div>`).join("")}</div><div class="scanline"></div></div><div class="flow"><span class="packet">&lt;/&gt;</span><span class="packet">{ }</span><span class="packet">↗</span></div><div class="browser"><div class="browser-chrome"><i></i><i></i><i></i><span>daylight.cafe</span></div><div class="webpage"><div class="page-title">Daylight Café</div><div class="photo-wrap"><img class="cafe-photo" src="cafe.png"></div><div class="page-copy">Good mornings start here.</div><div class="page-button">Explore the menu ↗</div><div class="selector-box"></div></div><div class="cursor">↖</div></div><div class="file-badge">style.css</div></div>`;
}
export const webCss = `
.web-demo{width:100%;height:680px;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center}.editor{width:92%;height:260px;background:#1c2529;border:2px solid #4b6267;border-radius:22px;position:relative;overflow:hidden;box-shadow:0 15px 45px #0003}.editor-title{font-size:20px;color:#94b2bb;background:#2b393e;padding:14px 24px;letter-spacing:1px}.code-lines{padding:18px 24px}.code-line{font:23px/1.3 monospace;white-space:pre;color:#a2dfcb}.scanline{position:absolute;top:58px;bottom:0;left:0;width:6px;background:var(--accent)}.flow{height:52px;position:relative;width:100%;display:flex;gap:50px;justify-content:center;align-items:center;color:var(--accent);font:24px monospace}.packet{display:block}.browser{width:88%;height:370px;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 24px 55px #0005;position:relative;border:2px solid #fff5}.browser-chrome{height:40px;display:flex;align-items:center;padding:0 16px;gap:8px;background:#e6e9e8;color:#698074;font:16px Arial}.browser-chrome i{width:9px;height:9px;border-radius:50%;background:#b2bab7}.browser-chrome i:first-child{background:#e98978}.browser-chrome span{margin:auto}.webpage{position:relative;height:330px;background:#fff3df;color:#382e27;padding:25px 32px;display:grid;grid-template-columns:1fr 46%;grid-template-rows:70px 70px 55px;gap:8px 24px;align-content:center}.page-title{font-size:42px;line-height:1.05;font-weight:800;letter-spacing:-2px;align-self:end}.photo-wrap{grid-column:2;grid-row:1/4;overflow:hidden;border-radius:18px}.cafe-photo{width:100%;height:100%;object-fit:cover;display:block}.page-copy{font:23px/1.3 Arial;max-width:240px}.page-button{align-self:start;justify-self:start;font-size:17px;padding:12px 17px;background:#ba4e20;color:white;border-radius:30px}.cursor{position:absolute;right:32px;bottom:20px;font-size:64px;color:#18292b;text-shadow:2px 2px white;z-index:3}.selector-box{position:absolute;left:25px;top:60px;width:340px;height:85px;border:5px solid #ba4e20;border-radius:12px;opacity:0}.file-badge{position:absolute;right:0;top:125px;background:#8cc9ff;color:#182125;padding:24px 20px;border-radius:12px;font:28px monospace;opacity:0}.stage-markup .editor{height:285px}.stage-markup .code-line{font-size:23px}.stage-markup .browser{height:310px}.stage-markup .webpage{height:270px}.stage-link .code-line{font-size:24px}.stage-selector .code-line:first-child{color:#ff917c}.overview{flex-direction:row;gap:20px;perspective:1200px}.tech-card{width:30%;height:380px;background:#d7fc70;color:#1a2c23;border-radius:25px;padding:28px 24px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 30px 50px #0004}.tech-card b{font-size:44px}.tech-card small{font-size:24px}.css-card{background:#8cc9ff}.js-card{background:#ffcf78}.mini-blocks{display:grid;gap:12px}.mini-blocks i{height:24px;background:#325b3e;border-radius:5px}.mini-blocks i:nth-child(2){width:70%}.mini-blocks i:nth-child(3){width:45%}.swatches{display:flex;gap:8px}.swatches i{width:42px;height:80px;border-radius:30px;background:#3266b4}.swatches i:nth-child(2){background:#ec7960}.swatches i:nth-child(3){background:#f5e9a6}.toggle{background:#92732e;border-radius:50px;width:140px;height:70px;padding:7px}.toggle i{display:block;width:56px;height:56px;background:white;border-radius:50%}.photo-panel{width:100%;height:620px;overflow:hidden;border-radius:30px;position:relative}.photo-panel span{position:absolute;left:35px;bottom:35px;background:#121718dd;border-radius:12px;padding:16px 25px;font-size:36px}.scene:has(.web-demo) h1{font-size:62px;letter-spacing:-2px}.scene:has(.web-demo) .eyebrow{margin-bottom:15px}.scene:has(.web-demo) .visual{margin-top:30px;height:680px}.scene:has(.web-demo) .eyebrow{font-size:18px}
`;
export function webAnimation(s: TimedScene, i: number) {
  if (!["web", "photo"].includes(s.visual)) return "";
  const q = `#scene-${i}`;
  const t = s.start + 0.25;
  const span = Math.max(0.5, s.duration - 0.8);
  const stage = s.webStage;
  let js = `tl.fromTo('${q} .cafe-photo',{scale:1.18,x:12},{scale:1.02,x:0,duration:${span},ease:'none'},${t});`;
  if (s.visual === "photo") return js;
  if (stage === "overview")
    return (
      js +
      `tl.fromTo('${q} .tech-card',{y:150,rotationY:-40,opacity:0},{y:0,rotationY:0,opacity:1,stagger:${span * 0.12},duration:.7,ease:'back.out(1.2)'},${t});tl.fromTo('${q} .mini-blocks i',{scaleX:0},{scaleX:1,stagger:.25,duration:.6,transformOrigin:'left'},${t + span * 0.25});tl.to('${q} .swatches i',{y:-30,stagger:.2,duration:.5,yoyo:true,repeat:1},${t + span * 0.4});tl.to('${q} .toggle i',{x:70,duration:.5,repeat:1,yoyo:true},${t + span * 0.65});`
    );
  js += `tl.fromTo('${q} .code-line',{clipPath:'inset(0 100% 0 0)',opacity:.3},{clipPath:'inset(0 0% 0 0)',opacity:1,duration:${Math.min(0.6, span * 0.12)},stagger:${span * 0.06},ease:'none'},${t});tl.fromTo('${q} .scanline',{y:0},{y:150,duration:${span * 0.6},ease:'steps(5)'},${t});tl.fromTo('${q} .packet',{y:-20,opacity:0},{y:25,opacity:1,duration:.65,stagger:.2,repeat:Math.max(0,Math.floor(${span}/1.2)-1),repeatDelay:.15,ease:'power1.in'},${t});tl.fromTo('${q} .cursor',{x:90,y:30},{x:-200,y:-100,duration:${span * 0.5},ease:'power2.inOut'},${t + span * 0.3});`;
  if (stage === "markup" || stage === "render")
    js += `tl.fromTo('${q} .page-title,${q} .photo-wrap,${q} .page-copy,${q} .page-button',{y:45,opacity:0,scale:.9},{y:0,opacity:1,scale:1,duration:.6,stagger:${span * 0.12},ease:'back.out(1.4)'},${t + span * 0.3});`;
  if (stage === "style")
    js += `tl.fromTo('${q} .webpage',{backgroundColor:'#ffffff'},{backgroundColor:'#fff3df',duration:.7},${t + span * 0.3});tl.fromTo('${q} .page-title',{color:'#222222',fontSize:30},{color:'#ba4e20',fontSize:42,duration:.7},${t + span * 0.4});tl.fromTo('${q} .photo-wrap',{borderRadius:0,scale:.8},{borderRadius:18,scale:1,duration:.8,ease:'back.out(1.5)'},${t + span * 0.5});tl.fromTo('${q} .page-button',{backgroundColor:'#777777',borderRadius:0},{backgroundColor:'#ba4e20',borderRadius:30,duration:.7},${t + span * 0.65});`;
  if (stage === "selector")
    js += `tl.to('${q} .selector-box',{opacity:1,duration:.3},${t + span * 0.25});tl.to('${q} .page-title',{color:'#ba4e20',scale:1.06,duration:.5,yoyo:true,repeat:1},${t + span * 0.45});tl.to('${q} .photo-wrap,${q} .page-copy,${q} .page-button',{opacity:.35,duration:.4},${t + span * 0.3});`;
  if (stage === "link" || stage === "delivery")
    js += `tl.fromTo('${q} .file-badge',{opacity:0,x:100,y:0,rotation:12},{opacity:1,x:-70,y:0,rotation:0,duration:.6},${t + span * 0.18});tl.to('${q} .file-badge',{x:-200,y:220,scale:.4,opacity:0,duration:1,ease:'power2.inOut'},${t + span * 0.5});tl.fromTo('${q} .browser',{scale:.82,y:30},{scale:1,y:0,duration:.8,ease:'back.out(1.2)'},${t + span * 0.65});`;
  return js;
}
