import { studioUrl } from "../src/config.js";
import { setTimeout as delay } from "node:timers/promises";
const startedAt = new Date().toISOString();
const request = await fetch(`${studioUrl}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message:
      process.argv.slice(2).join(" ") ||
      "Create a 25–35 second explainer about why the sky turns red at sunset. Use a vivid but scientifically accurate analogy. Use four different visual scenes. Generate the video now.",
  }),
});
const turn = await request.json();
if (!request.ok) throw new Error(JSON.stringify(turn));
console.log("TrueForge session:", turn.sessionId, "turn:", turn.turnId);
let lastStatus = "",
  projectId: string | undefined;
for (let i = 0; i < 180; i++) {
  const response = await fetch(
    `${studioUrl}/api/turns/${turn.sessionId}/${turn.turnId}`,
  );
  const state = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(state));
  // The final agent message contains the project link returned by its tool.
  const content = state.data?.state?.output?.content || "";
  projectId ||= content.match(/project=([a-f0-9-]{36})/)?.[1];
  const projects = await (await fetch(`${studioUrl}/api/projects`)).json();
  const project = projects.find((p: any) => p.id === projectId);
  const status = JSON.stringify({
    agent: state.data?.state?.status,
    project: project?.status,
    progress: project?.progress,
  });
  if (status !== lastStatus) {
    console.log(status);
    lastStatus = status;
  }
  if (project?.status === "complete") {
    console.log("VIDEO:", project.videoUrl);
    process.exit(0);
  }
  if (
    project?.status === "failed" ||
    ["failed", "cancelled"].includes(state.data?.state?.status)
  )
    throw new Error(project?.error || "Agent failed; inspect TrueForge.");
  if (state.data?.state?.status === "done" && !projectId)
    throw new Error(
      "Agent finished without a project link. Inspect its response in TrueForge.",
    );
  await delay(5000);
}
throw new Error(
  `Demo timed out (started ${startedAt}); the render may still be running in the studio.`,
);
