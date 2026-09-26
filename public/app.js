const $ = (s) => document.querySelector(s);
let sessionId = sessionStorage.getItem("yap-session") || undefined,
  activeTurn = sessionStorage.getItem("yap-turn") || undefined,
  selectedId = new URLSearchParams(location.search).get("project"),
  projects = [],
  busy = !!activeTurn,
  lastPreview = "",
  latestId;
let presenterAssetId, revisionProjectId, generationOptions;
let libraryAssets = [];
const selectedAssetIds = new Set();
let activeJob,
  completedTurnId,
  account,
  csrfToken,
  hosted = false,
  authenticated = false;
const safe = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function api(url, body) {
  const r = await studioFetch(
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
      `<a href="${safe(p.videoUrl)}" download="${safe(p.plan.title)}.mp4">Download MP4 ↓</a><a href="/media/${p.id}/storyboard.json" target="_blank">Animation source ↗</a>${p.sourcesUrl ? `<a href="${safe(p.sourcesUrl)}" target="_blank">Image sources ↗</a>` : ""}${p.clipSourcesUrl ? `<a href="${safe(p.clipSourcesUrl)}" target="_blank">Footage sources ↗</a><a href="${safe(p.creditsUrl)}" download>Credits ↓</a>` : ""}<button type="button" id="revise-video" class="text-button">Revise this video ↗</button>`;
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
    "#footage-share",
    "#opening-style",
    "#target-duration",
  ])
    $(id).disabled =
      busy ||
      (id === "#target-duration" && $("#video-mode").value === "presenter") ||
      (!generationOptions &&
        ["#director-model", "#reasoning-effort"].includes(id));
  try {
    if (!authenticated) return;
    const health = await api("/api/health");
    $("#connection").textContent = health.ready
      ? "● TRUEFORGE CONNECTED"
      : "STARTING…";
    $("#forge-link").hidden = hosted || !health.forgeUrl;
    if (health.forgeUrl) $("#forge-link").href = health.forgeUrl;
    if (!generationOptions) await loadGenerationOptions();
    projects = await api("/api/projects");
    renderLibrary();
    if (
      !busy &&
      !activeJob &&
      !activeTurn &&
      $("#activity").textContent === "Welcome back. Your collection is loading…"
    )
      activity(
        "Your collection is ready. Choose a video or start a new explainer.",
      );
    if (activeJob) {
      const result = await api(`/api/jobs/${encodeURIComponent(activeJob)}`);
      const job = result.job || result;
      const checkpoint = job.result || job;
      if (checkpoint.sessionId) sessionId = checkpoint.sessionId;
      if (checkpoint.turnId && checkpoint.turnId !== completedTurnId)
        activeTurn = checkpoint.turnId;
      if (job.projectId) selectedId = job.projectId;
      if (["failed", "cancelled", "interrupted"].includes(job.status)) {
        activeJob = activeTurn = undefined;
        busy = false;
        $("#create").disabled = false;
        activity(job.error || "This generation needs another try.", true);
      } else if (["complete", "completed", "done"].includes(job.status)) {
        activeJob = undefined;
        if (!activeTurn) {
          busy = false;
          $("#create").disabled = false;
          activity("Your video is ready in the collection.");
        }
      } else if (!activeTurn)
        activity(
          job.progress ||
            "Your generation is queued. You can return to this page while the worker runs.",
        );
      persistRun();
    }
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
        completedTurnId = activeTurn;
        activeTurn = undefined;
        sessionStorage.removeItem("yap-turn");
        persistRun();
        busy = !!activeJob;
        $("#create").disabled = busy;
        activity(
          state.status === "failed"
            ? hosted
              ? "The agent hit an error. The saved job retains its details; try a fresh generation."
              : "The agent hit an error. Check TrueForge for details or try again."
            : "Your director has finished this step. Renders continue here automatically.",
          state.status === "failed",
        );
      }
    }
  } catch (err) {
    activity(err.message, true);
  } finally {
    setTimeout(tick, 2500);
  }
}
$("#prompt-form").onsubmit = async (event) => {
  event.preventDefault();
  if (busy || !generationOptions || !authenticated) return;
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
      const response = await studioFetch("/api/presenter", {
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
      selectedAssetIds: [...selectedAssetIds],
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
    completedTurnId = undefined;
    activeJob = result.jobId;
    if (sessionId) sessionStorage.setItem("yap-session", sessionId);
    if (activeTurn) sessionStorage.setItem("yap-turn", activeTurn);
    persistRun();
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
  persistRun();
  $("#chat-log").textContent = "";
  $("#new-chat").hidden = true;
  activity("Fresh canvas. What should we explain next?");
};
$("#new-chat").hidden = !sessionId;
$("#create").disabled = busy;
void initializeStudio();

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
  persistRun();
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
  persistRun();
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
    footagePercent:
      $("#footage-mode").value === "off"
        ? 0
        : Number($("#footage-share").value),
    openingStyle: $("#opening-style").value,
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
function saveCreativeBrief(event) {
  const photo = $("#web-image-share");
  const footage = $("#footage-share");
  if (event?.target === footage && Number(footage.value) > 0)
    $("#footage-mode").value = "auto";
  if (
    $("#footage-mode").value !== "off" &&
    Number(photo.value) + Number(footage.value) > 100
  ) {
    if (event?.target === footage)
      photo.value = String(100 - Number(footage.value));
    else footage.value = String(100 - Number(photo.value));
  }
  const brief = selectedCreativeBrief();
  updateDuration();
  updateBudget();
  $("#web-image-label").textContent = `${brief.webImagePercent}%`;
  $("#footage-label").textContent = `${brief.footagePercent}%`;
  $("#visual-mix-hint").textContent =
    `${brief.webImagePercent}% photos · ${brief.footagePercent}% footage · ${100 - brief.webImagePercent - brief.footagePercent}% original graphics. Approximate targets; sources must fit the story.`;
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
  if (Number.isFinite(brief.footagePercent))
    $("#footage-share").value = String(
      Math.max(0, Math.min(100, brief.footagePercent)),
    );
  for (const [id, key] of [
    ["#opening-style", "openingStyle"],
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
  "#footage-share",
  "#opening-style",
])
  $(id).addEventListener("input", saveCreativeBrief);
try {
  applyCreativeBrief(JSON.parse(localStorage.getItem("yap-creative-brief")));
} catch {}
saveCreativeBrief();
function showShotPlan(p) {
  const scenes = p.plan.scenes || [];
  $("#shot-plan").hidden = !scenes.length;
  const brief = p.plan.creativeBrief;
  $("#shot-plan-content").innerHTML =
    (brief
      ? `<p>Requested direction: ${brief.targetDurationSeconds ? `target ${formatDuration(brief.targetDurationSeconds)} (±6s) · ` : ""}${brief.webImagePercent}% photo-led · ${brief.footage === "off" ? "no" : brief.footagePercent === undefined ? "automatic" : `${brief.footagePercent}%`} footage · ${safe(brief.openingStyle || "auto")} opening · ${safe(brief.explanationType)} · ${safe(brief.pacing)} pacing. Mix is a target, not a measured result.</p>`
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

function runStorageKey() {
  return `yap-active-run:${hosted ? account?.id || "signed-out" : "local"}`;
}
function persistRun() {
  if (hosted && !account) return;
  localStorage.setItem(
    runStorageKey(),
    JSON.stringify({
      sessionId,
      turnId: activeTurn,
      jobId: activeJob,
      completedTurnId,
    }),
  );
}
function restoreRun() {
  if (hosted) sessionId = activeTurn = undefined;
  try {
    const saved = JSON.parse(localStorage.getItem(runStorageKey()));
    if (saved) {
      sessionId = saved.sessionId || undefined;
      activeTurn = saved.turnId || undefined;
      activeJob = saved.jobId || undefined;
      completedTurnId = saved.completedTurnId || undefined;
    }
  } catch {}
  busy = !!(activeTurn || activeJob);
  $("#create").disabled = busy;
  $("#new-chat").hidden = !sessionId;
  if (busy)
    activity(
      "Reconnecting to your generation. Work continues even when this tab is closed.",
    );
}
async function studioFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (
    csrfToken &&
    !["GET", "HEAD"].includes((options.method || "GET").toUpperCase())
  )
    headers.set("x-csrf-token", csrfToken);
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (response.status === 401 && hosted) {
    authenticated = false;
    csrfToken = undefined;
    $("#account-controls").hidden = true;
    if (!$("#login-dialog").open) $("#login-dialog").showModal();
  }
  return response;
}
function applyAccount(result) {
  account = result.user;
  csrfToken = result.csrfToken;
  authenticated = true;
  $("#account-email").textContent = account.email;
  $("#account-controls").hidden = false;
  $("#manage-users").hidden = account.role !== "owner";
  $("#login-dialog").close();
  $("#login-password").value = "";
  $("#login-status").textContent = "";
  restoreRun();
  selectedAssetIds.clear();
  void refreshAssetLibrary();
}
async function initializeStudio() {
  try {
    const response = await fetch("/api/config", { credentials: "same-origin" });
    if (response.ok) hosted = !!(await response.json()).hosted;
    else if (response.status !== 404)
      throw new Error(
        "Studio configuration is unavailable. Reload to try again.",
      );
    if (hosted) {
      $("#forge-link").hidden = true;
      $("#storage-label").textContent = "YOUR PRIVATE CLOUD COLLECTION.";
      $("#render-location").textContent =
        "Your voice or AI narration · Cloud rendering";
      $("#presenter-privacy").textContent =
        "3–60 seconds · up to 250 MB per file. Files upload to this studio’s private backend; transcription and visual review send audio and still frames to the configured AI provider. A separate voiceover must already be aligned to your video.";
      const session = await studioFetch("/api/auth/session");
      if (session.ok) applyAccount(await session.json());
      else if (session.status !== 401)
        throw new Error("Sign-in is temporarily unavailable.");
    } else {
      authenticated = true;
      restoreRun();
      void refreshAssetLibrary();
    }
  } catch (error) {
    activity(error.message, true);
    $("#create").disabled = true;
  }
  void tick();
}
$("#login-dialog").addEventListener("cancel", (event) =>
  event.preventDefault(),
);
$("#login-form").onsubmit = async (event) => {
  event.preventDefault();
  $("#login-submit").disabled = true;
  $("#login-status").textContent = "Signing in…";
  try {
    const result = await api("/api/auth/login", {
      email: $("#login-email").value.trim(),
      password: $("#login-password").value,
    });
    applyAccount(result);
    activity("Welcome back. Your collection is loading…");
  } catch (error) {
    $("#login-status").textContent = error.message;
  } finally {
    $("#login-submit").disabled = false;
  }
};
$("#logout").onclick = async () => {
  try {
    await api("/api/auth/logout", {});
    authenticated = false;
    account = csrfToken = sessionId = activeTurn = activeJob = undefined;
    sessionStorage.removeItem("yap-session");
    sessionStorage.removeItem("yap-turn");
    busy = false;
    projects = [];
    libraryAssets = [];
    selectedAssetIds.clear();
    clearClipPreviews();
    $("#library-files").value = "";
    $("#asset-library-list").replaceChildren();
    lastPreview = latestId = selectedId = undefined;
    $("#account-controls").hidden = true;
    $("#projects").replaceChildren();
    $("#preview").replaceChildren();
    $("#video-actions").replaceChildren();
    $("#usage-panel").replaceChildren();
    $("#chat-log").textContent = "";
    $("#footage-credits").hidden = $("#shot-plan").hidden = true;
    $("#count").textContent = "00";
    $("#create").disabled = true;
    $("#login-dialog").showModal();
    history.replaceState(null, "", location.pathname);
  } catch (error) {
    activity(error.message, true);
  }
};
$("#close-users").onclick = () => $("#users-dialog").close();
async function loadUsers() {
  const result = await api("/api/auth/users");
  $("#users-list").innerHTML =
    `<ul>${result.users.map((user) => `<li>${safe(user.email)} <span class="muted">${safe(user.role)}</span></li>`).join("")}</ul>`;
}
$("#manage-users").onclick = async () => {
  $("#users-dialog").showModal();
  $("#user-status").textContent = "";
  try {
    await loadUsers();
  } catch (error) {
    $("#user-status").textContent = error.message;
  }
};
$("#create-user-form").onsubmit = async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const result = await api("/api/auth/users", {
      email: $("#new-user-email").value.trim(),
      password: $("#new-user-password").value,
    });
    $("#new-user-password").value = "";
    $("#user-status").textContent =
      `Account created for ${result.user.email}. Share the initial password privately.`;
    await loadUsers();
  } catch (error) {
    $("#user-status").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
};

const clipSelections = new Map();
let clipPreviewUrls = [];
function clearClipPreviews() {
  for (const video of document.querySelectorAll("#library-clip-previews video"))
    video.pause();
  for (const url of clipPreviewUrls) URL.revokeObjectURL(url);
  clipPreviewUrls = [];
  clipSelections.clear();
  $("#library-clip-previews").replaceChildren();
}
window.addEventListener("pagehide", clearClipPreviews);
$("#library-files").onchange = () => {
  clearClipPreviews();
  const files = [...$("#library-files").files];
  files.forEach((file, index) => {
    if (
      !file.type.startsWith("video/") &&
      !/\.(mp4|mov|webm|mkv)$/i.test(file.name)
    )
      return;
    const url = URL.createObjectURL(file);
    clipPreviewUrls.push(url);
    const card = document.createElement("section");
    card.className = "clip-trim-card";
    card.innerHTML = `<strong>${safe(file.name)}</strong><video controls muted playsinline preload="metadata"></video><p class="muted clip-trim-summary" role="status">Loading source preview…</p><label for="clip-start-${index}">Excerpt starts at <output class="clip-start-label">0.0s</output></label><input id="clip-start-${index}" type="range" min="0" max="27" step="0.1" value="0"><label for="clip-length-${index}">Excerpt length <output class="clip-length-label">5.0s</output></label><input id="clip-length-${index}" type="range" min="3" max="5" step="0.1" value="5"><button type="button" class="text-button clip-play-excerpt">Play selected excerpt ▶</button>`;
    $("#library-clip-previews").append(card);
    const video = card.querySelector("video"),
      start = card.querySelector('[id^="clip-start-"]'),
      length = card.querySelector('[id^="clip-length-"]'),
      summary = card.querySelector(".clip-trim-summary");
    const selection = { fileIndex: index, startSeconds: 0, durationSeconds: 5 };
    clipSelections.set(index, selection);
    let sourceDuration,
      excerptPlaying = false;
    function update(seek = false) {
      const finite = Number.isFinite(sourceDuration);
      start.max = finite
        ? Math.min(27, Math.max(0, Math.floor((sourceDuration - 3) * 10) / 10))
        : 27;
      selection.startSeconds = Math.min(Number(start.value), Number(start.max));
      start.value = selection.startSeconds;
      length.max = finite
        ? Math.min(
            5,
            Math.floor((sourceDuration - selection.startSeconds) * 10) / 10,
          )
        : 5;
      selection.durationSeconds = Math.min(
        Number(length.value),
        Number(length.max),
      );
      length.value = selection.durationSeconds;
      card.querySelector(".clip-start-label").textContent =
        selection.startSeconds.toFixed(1) + "s";
      card.querySelector(".clip-length-label").textContent =
        selection.durationSeconds.toFixed(1) + "s";
      const invalid = finite && (sourceDuration < 3 || sourceDuration > 30.1);
      selection.error = invalid
        ? "Choose a source clip between 3 and 30 seconds."
        : file.size > 100 * 1024 * 1024
          ? "Clips must be under 100 MB."
          : undefined;
      summary.textContent =
        selection.error ||
        `${selection.startSeconds.toFixed(1)}–${(selection.startSeconds + selection.durationSeconds).toFixed(1)}s${finite ? " of " + sourceDuration.toFixed(1) + "s" : ""} · source audio muted`;
      start.disabled = length.disabled = invalid;
      card.querySelector(".clip-play-excerpt").disabled = invalid;
      if (seek) {
        excerptPlaying = false;
        video.pause();
        video.currentTime = selection.startSeconds;
      }
    }
    video.onloadedmetadata = () => {
      sourceDuration = video.duration;
      update();
    };
    video.onerror = () => {
      summary.textContent =
        "This browser cannot preview the clip. Choose its range manually; the upload will validate it.";
    };
    start.oninput = () => update(true);
    length.oninput = () => update(true);
    video.ontimeupdate = () => {
      if (
        excerptPlaying &&
        video.currentTime >= selection.startSeconds + selection.durationSeconds
      ) {
        video.pause();
        excerptPlaying = false;
      }
    };
    card.querySelector(".clip-play-excerpt").onclick = async () => {
      video.currentTime = selection.startSeconds;
      excerptPlaying = true;
      try {
        await video.play();
      } catch {
        summary.textContent =
          "Preview unavailable. The selected timestamps will still be checked during upload.";
      }
    };
    video.src = url;
    update();
  });
};
function showAssetLibrary() {
  $("#asset-library-list").innerHTML = libraryAssets.length
    ? libraryAssets
        .map((asset) => {
          const metadata = asset.metadata || asset;
          const title =
            metadata.title || metadata.originalFilename || "Untitled asset";
          const excerpt =
            asset.kind === "clip" &&
            Number.isFinite(metadata.sourceStart) &&
            Number.isFinite(metadata.sourceEnd)
              ? ` · ${metadata.sourceStart.toFixed(1)}–${metadata.sourceEnd.toFixed(1)}s from source`
              : "";
          return `<label class="asset-library-item"><input type="checkbox" data-asset-id="${safe(asset.id)}" ${selectedAssetIds.has(asset.id) ? "checked" : ""}>${asset.kind === "image" ? `<img class="asset-library-thumb" loading="lazy" alt="" src="/api/assets/${safe(asset.id)}/content">` : '<span class="asset-library-thumb clip-marker" aria-hidden="true">▶</span>'}<span><strong>${safe(title)}</strong><small>${safe(asset.kind || metadata.kind || "asset")}${safe(excerpt)} · ${safe(metadata.description || metadata.purpose || metadata.channel || "Saved in your library")}</small></span></label>`;
        })
        .join("")
    : '<p class="muted">Your imported and uploaded visuals will appear here.</p>';
  for (const checkbox of document.querySelectorAll("[data-asset-id]"))
    checkbox.onchange = () => {
      if (checkbox.checked && selectedAssetIds.size >= 30) {
        checkbox.checked = false;
        $("#library-upload-status").textContent =
          "Choose up to 30 assets for one video.";
        return;
      }
      if (checkbox.checked) selectedAssetIds.add(checkbox.dataset.assetId);
      else selectedAssetIds.delete(checkbox.dataset.assetId);
    };
}
async function refreshAssetLibrary() {
  if (!authenticated) return;
  try {
    const result = await api("/api/assets");
    libraryAssets = (
      Array.isArray(result) ? result : result.assets || []
    ).filter((asset) => ["image", "clip"].includes(asset.kind));
    showAssetLibrary();
  } catch (error) {
    $("#library-upload-status").textContent = error.message;
  }
}
$("#refresh-asset-library").onclick = refreshAssetLibrary;
$("#upload-library-assets").onclick = async () => {
  const files = [...$("#library-files").files];
  if (!files.length) {
    $("#library-upload-status").textContent = "Choose images or clips first.";
    return;
  }
  if (files.length > 8) {
    $("#library-upload-status").textContent = "Upload up to 8 files at a time.";
    return;
  }
  const invalid = [...clipSelections.values()].find(
    (selection) => selection.error,
  );
  if (invalid) {
    $("#library-upload-status").textContent = invalid.error;
    return;
  }
  const button = $("#upload-library-assets");
  button.disabled = true;
  $("#library-files").disabled = true;
  $("#library-upload-status").textContent =
    "Uploading and preparing your visuals…";
  try {
    if (clipSelections.size) {
      const capabilities = await api("/api/config");
      if (!capabilities.clipTrimRanges)
        throw new Error(
          "Clip selection is waiting for the studio update. Please try uploading again shortly.",
        );
    }
    const form = new FormData();
    for (const file of files) form.append("files", file);
    form.append("description", $("#library-description").value.trim());
    form.append(
      "trimRanges",
      JSON.stringify(
        [...clipSelections.values()].map(
          ({ fileIndex, startSeconds, durationSeconds }) => ({
            fileIndex,
            startSeconds,
            durationSeconds,
          }),
        ),
      ),
    );
    const response = await studioFetch("/api/assets/upload", {
      method: "POST",
      body: form,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed");
    const assets = result.assets || [];
    for (const asset of assets)
      if (selectedAssetIds.size < 30) selectedAssetIds.add(asset.id);
    $("#library-files").value = "";
    clearClipPreviews();
    $("#library-upload-status").textContent =
      `${assets.length} asset${assets.length === 1 ? "" : "s"} ready and selected for your next video.`;
    await refreshAssetLibrary();
  } catch (error) {
    $("#library-upload-status").textContent = error.message;
  } finally {
    button.disabled = false;
    $("#library-files").disabled = false;
  }
};
