const $ = (s) => document.querySelector(s);
let sessionId = sessionStorage.getItem("yap-session") || undefined,
  activeTurn = sessionStorage.getItem("yap-turn") || undefined,
  selectedId = new URLSearchParams(location.search).get("project"),
  projects = [],
  busy = !!activeTurn,
  lastPreview = "",
  latestId;
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
  try {
    const health = await api("/api/health");
    $("#connection").textContent = health.ready
      ? "● TRUEFORGE CONNECTED"
      : "STARTING…";
    $("#forge-link").href = health.forgeUrl;
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
  const message = $("#prompt").value.trim();
  if (!message) return;
  busy = true;
  $("#create").disabled = true;
  $("#chat-log").textContent = "";
  activity("TrueForge is planning your story and choosing the visuals…");
  try {
    const result = await api("/api/chat", { message, sessionId });
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
