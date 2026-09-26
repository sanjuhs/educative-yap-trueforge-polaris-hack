const $ = (s) => document.querySelector(s);
let sessionId = sessionStorage.getItem("yap-session") || undefined,
  activeTurn = sessionStorage.getItem("yap-turn") || undefined,
  selectedId = new URLSearchParams(location.search).get("project"),
  projects = [],
  busy = !!activeTurn,
  lastPreview = "",
  latestId;
let presenterAssetId;
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
  const signature = `${p.id}:${p.status}:${p.progress}`;
  if (signature === lastPreview) return;
  lastPreview = signature;
  history.replaceState(null, "", `?project=${p.id}`);
  $("#video-actions").innerHTML = "";
  if (p.status === "complete") {
    $("#preview").innerHTML =
      `<video controls playsinline preload="metadata" poster="/media/${p.id}/poster.jpg" src="${safe(p.videoUrl)}"></video>`;
    $("#video-actions").innerHTML =
      `<a href="${safe(p.videoUrl)}" download="${safe(p.plan.title)}.mp4">Download MP4 ↓</a><a href="/media/${p.id}/storyboard.json" target="_blank">Storyboard ↗</a>`;
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
  for (const id of ["#video-mode", "#presenter-video", "#presenter-voice"])
    $(id).disabled = busy;
  try {
    const health = await api("/api/health");
    $("#connection").textContent = health.ready
      ? "● TRUEFORGE CONNECTED"
      : "STARTING…";
    $("#forge-link").href = health.forgeUrl;
    $("#model-info").textContent =
      `${health.model} · ${health.reasoning} reasoning · Directed through TrueForge`;
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
  if (busy) return;
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
      ...(presenterMode ? { presenterAssetId } : {}),
    });
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
  $("#upload-status").textContent = "";
}
$("#presenter-video").onchange = resetRecording;
$("#presenter-voice").onchange = resetRecording;
$("#video-mode").onchange = () => {
  const presenter = $("#video-mode").value === "presenter";
  $("#presenter-inputs").hidden = !presenter;
  $("#prompt").required = !presenter;
  $("#format-hint").textContent = presenter
    ? "9:16 · Your voice · Visuals above"
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
  panel.innerHTML = `<strong>AI cost estimate · ${money(u.estimatedUsd)}</strong><p>${safe(u.model)} · ${safe(u.reasoning)} reasoning</p><dl><dt>Input tokens</dt><dd>${m.total_input_tokens.toLocaleString()}</dd><dt>Output tokens (includes reasoning)</dt><dd>${m.total_output_tokens.toLocaleString()}</dd><dt>Cached input (included above)</dt><dd>${(m.total_cache_read_tokens || 0).toLocaleString()}</dd><dt>Cache writes (included in input)</dt><dd>${(m.total_cache_write_tokens || 0).toLocaleString()}</dd><dt>Reasoning tokens (included above)</dt><dd>${(m.total_reasoning_tokens || 0).toLocaleString()}</dd><dt>Director · ${u.modelCalls} model calls</dt><dd>${money(u.modelEstimateUsd)}</dd><dt>Audio estimate</dt><dd>${money(u.audioEstimateUsd)}</dd><dt>Net caching discount (after writes)</dt><dd>${money(u.cacheDiscountUsd)}</dd></dl><p>${safe(u.audioBasis)}. ${safe(u.imageAsset || "")}.</p><p>Rendering and status checks make 0 additional model calls.</p><details><summary>How this estimate works</summary><p>Measured TrueForge turn tokens × standard OpenAI prices, ${safe(u.pricingDate)}. ${u.sharedTurn ? "Director cost is shared across multiple outputs from this turn; total is not allocated." : "Includes this generation turn, not previous revisions."} ${safe(u.error || "")}</p><p>Excludes: ${safe(u.exclusions)}</p><a href="${safe(u.pricingSource)}" target="_blank" rel="noreferrer">Pricing source ↗</a></details>`;
}
