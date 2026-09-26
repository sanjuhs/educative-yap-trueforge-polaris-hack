const $ = (s) => document.querySelector(s);
let sessionId = sessionStorage.getItem("yap-session") || undefined,
  activeTurn = sessionStorage.getItem("yap-turn") || undefined,
  selectedId = new URLSearchParams(location.search).get("project"),
  projects = [],
  busy = !!activeTurn,
  lastPreview = "",
  latestId;
let presenterAssetId, revisionProjectId, generationOptions;
const safe = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function api(url, body) {
  const r = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
function activity(text, error = false) {
  $("#activity").textContent = text;
  $("#activity").classList.toggle("error", error);
}
function show(p) {
  selectedId = p.id;
  showUsage(p.usage);
  showShotPlan(p);
  $("#footage-credits").hidden = !p.creditsText;
  $("#footage-credits-text").value = p.creditsText || "";
  const signature = `${p.id}:${p.status}:${p.progress}`;
  if (signature === lastPreview) return;
  lastPreview = signature;
  history.replaceState(null, "", `?project=${p.id}`);
  $("#video-actions").innerHTML = "";
  if (p.status === "complete") {
    $("#preview").innerHTML =
      `<video controls playsinline preload="metadata" poster="/media/${p.id}/poster.jpg" src="${safe(p.videoUrl)}"></video>`;
    $("#video-actions").innerHTML =
      `<a href="${safe(p.videoUrl)}" download="${safe(p.plan.title)}.mp4">Download MP4 ↓</a><a href="/media/${p.id}/storyboard.json" target="_blank">Animation source ↗</a>${p.clipSourcesUrl ? `<a href="${safe(p.clipSourcesUrl)}" target="_blank">Footage sources ↗</a><a href="${safe(p.creditsUrl)}" download>Credits ↓</a>` : ""}<button type="button" id="revise-video" class="text-button">Revise this video ↗</button>`;
    $("#revise-video").onclick = () => {
      if (busy) return;
      $("#video-mode").value = p.plan.presenterAssetId
        ? "presenter"
        : "narrated";
      $("#video-mode").dispatchEvent(new Event("change"));
      revisionProjectId = p.id;
      if (p.plan.creativeBrief) applyCreativeBrief(p.plan.creativeBrief);
      presenterAssetId = p.plan.presenterAssetId;
      if (presenterAssetId) {
        $("#presenter-mode").value = p.plan.presenterMode || "cutout";
        $("#upload-status").textContent =
          "Reusing this video’s recording and transcript";
      }
      $("#prompt").placeholder =
        "What should change? Layout, motion, visual metaphor, presenter placement…";
      $("#prompt").focus();
      activity(
        "Tell your selected director how to revise this video. It can rewrite the entire animation.",
      );
    };
  } else {
    $("#preview").innerHTML =
      `<div class="progress-frame"><div>${safe(p.status === "failed" ? "This render needs another take." : p.plan.title)}<span>${safe(p.error || p.progress)}</span></div></div>`;
  }
}
function renderLibrary() {
  $("#count").textContent = String(projects.length).padStart(2, "0");
  if (!projects.length) return;
  if (latestId && latestId !== projects[0].id) selectedId = projects[0].id;
  latestId = projects[0].id;
  $("#projects").innerHTML = projects
    .map(
      (p) =>
        `<button class="project-card" data-id="${p.id}"><span class="tag ${p.status === "failed" ? "failed" : ""}">${safe(p.status.toUpperCase())}</span><strong>${safe(p.plan.title)}</strong><small>${p.duration ? Math.round(p.duration) + " SEC · " : ""}${safe(p.progress)}</small></button>`,
    )
    .join("");
  for (const b of document.querySelectorAll(".project-card"))
    b.onclick = () => show(projects.find((p) => p.id === b.dataset.id));
  const p = projects.find((p) => p.id === selectedId) || projects[0];
  if (p) show(p);
}
function assistantText(turn) {
  const texts = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (
      ["assistant.message", "model.message"].includes(value.type) &&
      value.content
    ) {
      if (typeof value.content === "string") texts.push(value.content);
      else if (Array.isArray(value.content))
        for (const c of value.content) if (c.text) texts.push(c.text);
      return;
    }
    if (value.type === "output_text" && typeof value.text === "string") {
      texts.push(value.text);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else for (const v of Object.values(value)) visit(v);
  }
  visit(turn);
  return [...new Set(texts)].join("\n\n");
}
async function tick() {
  for (const id of [
    "#video-mode",
    "#presenter-video",
    "#presenter-voice",
    "#presenter-mode",
    "#director-model",
    "#reasoning-effort",
    "#web-image-share",
    "#explanation-type",
    "#visual-pacing",
    "#text-density",
    "#visual-notes",
    "#footage-mode",
    "#target-duration",
  ])
    $(id).disabled =
      busy ||
      (id === "#target-duration" && $("#video-mode").value === "presenter") ||
      (!generationOptions &&
        ["#director-model", "#reasoning-effort"].includes(id));
  try {
    const health = await api("/api/health");
    $("#connection").textContent = health.ready
      ? "● TRUEFORGE CONNECTED"
      : "STARTING…";
    $("#forge-link").href = health.forgeUrl;
    if (!generationOptions) await loadGenerationOptions();
    projects = await api("/api/projects");
    renderLibrary();
    if (activeTurn) {
      const result = await api(`/api/turns/${sessionId}/${activeTurn}`);
      const turn = result.data;
      const state = turn.state || {};
      const text = assistantText(turn);
      if (text) $("#chat-log").textContent = text;
      $("#chat-log").className = text ? "message" : "";
      if (
        [
          "done",
          "completed",
          "complete",
          "failed",
          "cancelled",
          "interrupted",
        ].includes(state.status)
      ) {
        activeTurn = undefined;
        sessionStorage.removeItem("yap-turn");
        busy = false;
        $("#create").disabled = false;
        activity(
          state.status === "failed"
            ? "The agent hit an error. Check TrueForge for details or try again."
            : "Your director has finished this step. Renders continue here automatically.",
          state.status === "failed",
        );
      }
    }
  } catch (err) {
    activity(err.message, true);
  }
  setTimeout(tick, 2500);
}
$("#prompt-form").onsubmit = async (event) => {
  event.preventDefault();
  if (busy || !generationOptions) return;
  const generation = selectedGeneration();
  const creativeBrief = selectedCreativeBrief();
  const presenterMode = $("#video-mode").value === "presenter";
  const message =
    $("#prompt").value.trim() ||
    (presenterMode
      ? "Add explainer visuals above my video, following my narration."
      : "");
  if (!message) return;
  if (presenterMode && !presenterAssetId && !$("#presenter-video").files[0]) {
    activity("Choose your video first.", true);
    return;
  }
  busy = true;
  $("#create").disabled = true;
  $("#chat-log").textContent = "";
  activity("TrueForge is planning your story and choosing the visuals…");
  try {
    if (presenterMode && !presenterAssetId) {
      activity("Uploading your recording and transcribing your voice…");
      const form = new FormData();
      form.append("video", $("#presenter-video").files[0]);
      if ($("#presenter-voice").files[0])
        form.append("voiceover", $("#presenter-voice").files[0]);
      const response = await fetch("/api/presenter", {
        method: "POST",
        body: form,
      });
      const asset = await response.json();
      if (!response.ok) throw new Error(asset.error || "Upload failed");
      presenterAssetId = asset.id;
      $("#upload-status").textContent =
        `Ready · ${Math.round(asset.duration)} seconds · Your original voice`;
    }
    activity("TrueForge is planning your visuals…");
    const result = await api("/api/chat", {
      message,
      sessionId,
      generation,
      creativeBrief,
      ...(revisionProjectId ? { revisionProjectId } : {}),
      ...(presenterMode
        ? { presenterAssetId, presenterMode: $("#presenter-mode").value }
        : {}),
    });
    if (result.sessionReset)
      activity(
        "Started a fresh session for the selected model. The saved revision source is retained.",
      );
    sessionId = result.sessionId;
    activeTurn = result.turnId;
    sessionStorage.setItem("yap-session", sessionId);
    sessionStorage.setItem("yap-turn", activeTurn);
    $("#new-chat").hidden = false;
    $("#prompt").value = "";
    $("#prompt").placeholder =
      "Make it more playful, use a different analogy, or explain another idea…";
  } catch (err) {
    busy = false;
    $("#create").disabled = false;
    activity(err.message, true);
  }
};
for (const b of document.querySelectorAll("[data-topic]"))
  b.onclick = () => {
    $("#prompt").value = b.dataset.topic;
    $("#prompt").focus();
  };
$("#new-chat").onclick = () => {
  if (busy) return;
  sessionId = undefined;
  sessionStorage.removeItem("yap-session");
  $("#chat-log").textContent = "";
  $("#new-chat").hidden = true;
  activity("Fresh canvas. What should we explain next?");
};
$("#new-chat").hidden = !sessionId;
$("#create").disabled = busy;
void tick();

function resetRecording() {
  presenterAssetId = undefined;
  revisionProjectId = undefined;
  $("#upload-status").textContent = "";
}
$("#presenter-video").onchange = resetRecording;
$("#presenter-voice").onchange = resetRecording;
$("#video-mode").onchange = () => {
  revisionProjectId = undefined;
  const presenter = $("#video-mode").value === "presenter";
  $("#presenter-inputs").hidden = !presenter;
  updateDuration();
  updateBudget();
  $("#prompt").required = !presenter;
  $("#format-hint").textContent = presenter
    ? "9:16 · Your voice · Original motion design"
    : "9:16 · AI voice · Motion · MP4";
  sessionId = undefined;
  sessionStorage.removeItem("yap-session");
};

function showUsage(u) {
  const panel = $("#usage-panel");
  if (!u?.metrics) {
    panel.textContent =
      "AI usage appears after the director finishes. Older projects were not metered.";
    return;
  }
  const m = u.metrics,
    money = (v) => (v === undefined ? "Unavailable" : `$${v.toFixed(4)}`);
  panel.innerHTML = `<strong>AI cost estimate · ${money(u.estimatedUsd)}</strong><p>${safe(u.model)} · ${safe(u.reasoning)} reasoning</p><dl><dt>Input tokens</dt><dd>${m.total_input_tokens.toLocaleString()}</dd><dt>Output tokens (includes reasoning)</dt><dd>${m.total_output_tokens.toLocaleString()}</dd><dt>Cached input (included above)</dt><dd>${(m.total_cache_read_tokens || 0).toLocaleString()}</dd><dt>Cache writes (included in input)</dt><dd>${(m.total_cache_write_tokens || 0).toLocaleString()}</dd><dt>Reasoning tokens (included above)</dt><dd>${(m.total_reasoning_tokens || 0).toLocaleString()}</dd><dt>Editing + review · ${u.modelCalls} model calls</dt><dd>${money(u.modelEstimateUsd)}</dd><dt>Included vision reviews</dt><dd>${u.visionModelCalls || 0}</dd><dt>Audio estimate</dt><dd>${money(u.audioEstimateUsd)}</dd><dt>Net caching discount (after writes)</dt><dd>${money(u.cacheDiscountUsd)}</dd></dl><p>${safe(u.audioBasis)}.${u.imageAsset ? " " + safe(u.imageAsset) : ""}</p><p>Rendering and status checks make 0 additional model calls.</p><details><summary>How this estimate works</summary><p>Measured TrueForge turn tokens × standard OpenAI prices, ${safe(u.pricingDate)}. ${u.sharedTurn ? "Director cost is shared across multiple outputs from this turn; total is not allocated." : "Includes this generation turn, not previous revisions."} ${safe(u.error || "")}</p><p>Excludes: ${safe(u.exclusions)}</p><a href="${safe(u.pricingSource)}" target="_blank" rel="noreferrer">Pricing source ↗</a></details>`;
}

function selectedGeneration() {
  return {
    model: $("#director-model").value,
    reasoning: $("#reasoning-effort").value,
  };
}
async function loadGenerationOptions() {
  generationOptions = await api("/api/generation-options");
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem("yap-generation"));
  } catch {}
  const models = generationOptions.models;
  const settings =
    saved &&
    models.some((m) => m.id === saved.model) &&
    generationOptions.reasoning.includes(saved.reasoning)
      ? saved
      : generationOptions.defaults;
  $("#director-model").innerHTML = models
    .map((m) => `<option value="${safe(m.id)}">${safe(m.label)}</option>`)
    .join("");
  $("#reasoning-effort").innerHTML = generationOptions.reasoning
    .map(
      (e) =>
        `<option value="${safe(e)}">${safe(e === "xhigh" ? "Extra high" : e === "max" ? "Maximum" : e[0].toUpperCase() + e.slice(1))}</option>`,
    )
    .join("");
  $("#director-model").value = settings.model;
  $("#reasoning-effort").value = settings.reasoning;
  $("#director-model").disabled = $("#reasoning-effort").disabled = busy;
  $("#budget-assumptions").textContent = generationOptions.estimateBasis;
  updateBudget();
}
function updateBudget() {
  if (!generationOptions) return;
  const selected = selectedGeneration();
  const model = generationOptions.models.find((m) => m.id === selected.model);
  const presenter = $("#video-mode").value === "presenter";
  const target = presenter ? 30 : Number($("#target-duration").value);
  const scale = target / 30;
  const audio = generationOptions.audio[$("#video-mode").value];
  const dollars = (n) => `$${n.toFixed(3)}`;
  const label = presenter
    ? "30s recording example"
    : `${formatDuration(target)} rough AI budget`;
  $("#budget-estimate").textContent =
    audio === null
      ? `${label}: ${dollars(model.estimate.low * scale)}–${dollars(model.estimate.high * scale)} + audio (unpriced)`
      : `${label}: ~${dollars((model.estimate.low + audio) * scale)}–${dollars((model.estimate.high + audio) * scale)}`;
  $("#budget-assumptions").textContent =
    generationOptions.estimateBasis +
    " For other durations this is a proportional planning estimate, not a benchmark or quote. Short videos still incur setup work; long videos can need more context and revisions. Actual usage appears with the result.";
  $("#model-info").textContent =
    `${selected.model} · ${selected.reasoning} reasoning · Original animation through TrueForge`;
}
function changeGeneration() {
  if (busy) return;
  localStorage.setItem("yap-generation", JSON.stringify(selectedGeneration()));
  sessionId = undefined;
  sessionStorage.removeItem("yap-session");
  $("#chat-log").textContent = "";
  $("#new-chat").hidden = true;
  updateBudget();
  activity(
    "Model selected. A fresh session keeps its usage separate; use ‘Revise this video’ to carry over an existing design.",
  );
}
$("#director-model").onchange = changeGeneration;
$("#reasoning-effort").onchange = changeGeneration;

function selectedCreativeBrief() {
  return {
    ...($("#video-mode").value === "presenter"
      ? {}
      : { targetDurationSeconds: Number($("#target-duration").value) }),
    footage: $("#footage-mode").value,
    webImagePercent: Number($("#web-image-share").value),
    explanationType: $("#explanation-type").value,
    pacing: $("#visual-pacing").value,
    textDensity: $("#text-density").value,
    notes: $("#visual-notes").value.trim(),
  };
}
function formatDuration(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}
function updateDuration() {
  const presenter = $("#video-mode").value === "presenter";
  const target = Number($("#target-duration").value);
  $("#duration-label").textContent = presenter
    ? "From your recording"
    : formatDuration(target);
  $("#target-duration").disabled = busy || presenter;
  $("#target-duration").setAttribute(
    "aria-valuetext",
    `${Math.floor(target / 60)} minutes ${target % 60} seconds`,
  );
  $("#duration-hint").textContent = presenter
    ? "Your recording sets the length; your original voice stays unchanged. Presenter uploads currently support 3–60 seconds."
    : `Target ${formatDuration(target)} · expected ${formatDuration(Math.max(1, target - 6))}–${formatDuration(target + 6)}. Longer videos add chapters and take more time to generate and render.`;
}
function saveCreativeBrief() {
  const brief = selectedCreativeBrief();
  updateDuration();
  updateBudget();
  $("#web-image-label").textContent = `${brief.webImagePercent}%`;
  localStorage.setItem("yap-creative-brief", JSON.stringify(brief));
}
function applyCreativeBrief(brief) {
  if (!brief || typeof brief !== "object") return;
  if (Number.isFinite(brief.targetDurationSeconds))
    $("#target-duration").value = String(
      Math.max(
        5,
        Math.min(1200, Math.round(brief.targetDurationSeconds / 5) * 5),
      ),
    );
  if (Number.isFinite(brief.webImagePercent))
    $("#web-image-share").value = String(
      Math.max(0, Math.min(100, brief.webImagePercent)),
    );
  for (const [id, key] of [
    ["#footage-mode", "footage"],
    ["#explanation-type", "explanationType"],
    ["#visual-pacing", "pacing"],
    ["#text-density", "textDensity"],
  ]) {
    if ([...$(id).options].some((o) => o.value === brief[key]))
      $(id).value = brief[key];
  }
  if (typeof brief.notes === "string")
    $("#visual-notes").value = brief.notes.slice(0, 1500);
  saveCreativeBrief();
}
for (const id of [
  "#web-image-share",
  "#target-duration",
  "#explanation-type",
  "#visual-pacing",
  "#text-density",
  "#visual-notes",
  "#footage-mode",
])
  $(id).addEventListener("input", saveCreativeBrief);
try {
  applyCreativeBrief(JSON.parse(localStorage.getItem("yap-creative-brief")));
} catch {}
updateDuration();
function showShotPlan(p) {
  const scenes = p.plan.scenes || [];
  $("#shot-plan").hidden = !scenes.length;
  const brief = p.plan.creativeBrief;
  $("#shot-plan-content").innerHTML =
    (brief
      ? `<p>Requested direction: ${brief.targetDurationSeconds ? `target ${formatDuration(brief.targetDurationSeconds)} (±6s) · ` : ""}${brief.webImagePercent}% photo-led screen time · ${safe(brief.explanationType)} · ${safe(brief.pacing)} pacing. Mix is a target, not a measured result.</p>`
      : "") +
    `<ol>${scenes.map((s) => `<li><strong>${safe(s.title)}</strong>${s.shotKind ? `<span class="shot-kind">${safe(s.shotKind)}</span>` : ""}<p>${safe(s.visualIntent || "")}</p></li>`).join("")}</ol>`;
}

$("#copy-footage-credits").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("#footage-credits-text").value);
    $("#credits-copy-status").textContent = "Copied";
  } catch {
    $("#footage-credits-text").focus();
    $("#footage-credits-text").select();
    $("#credits-copy-status").textContent =
      "Select and copy the credits above.";
  }
};
