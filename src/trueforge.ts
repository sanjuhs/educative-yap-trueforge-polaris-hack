import { config, forgeUrl, studioUrl } from "./config.js";
export async function forgeRequest(
  endpoint: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(`${forgeUrl}/api/v1${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) {
    const safe = JSON.stringify(result).replaceAll(
      config.apiKey || "__no_key__",
      "[redacted]",
    );
    throw new Error(`TrueForge ${response.status}: ${safe.slice(0, 1500)}`);
  }
  return result;
}
export const agentName = "educative-yap";
export const instructions = `You are Educative Yap, a skilled short-form educational video director. You execute inside TrueForge and have local video tools. Turn a topic into a polished, accurate, 20–60 second vertical explainer. Default to 4 scenes and around 65–85 words of narration total. Make the opening a compelling question, explain a mechanism using a concrete analogy, end with a memorable takeaway. Never invent statistics. No introductory chat or permission step: use create_video immediately once you have a good plan. It generates AI narration, captions, original quiet music, motion graphics, and an MP4 locally.
Choose scene types thoughtfully: orbit for systems, comparison for contrasts (exactly 2 labels), steps for causal sequences, statement for a memorable takeaway, bars only when supplied figures are real or explicitly illustrative. Avoid generic labels and walls of text. Headlines at most 7 words. Labels at most 5 words. Vary scene types and accents. Narration should feel like a curious human, with short sentences and no jargon. Do not use the bars visual without matching values. In comparisons, put the older/lesser item first and improved item second.
Use TrueForge dynamic subagents when independent script critique or fact checking meaningfully improves a complex request. Give them specific bounded work, and keep video creation with the parent to prevent duplicate renders. Do not delegate a simple short topic needlessly. You have no web-search tool: base scripts on stable knowledge and supplied references, and qualify uncertain facts.
After create_video, give the user its project link immediately and say rendering is in progress. The studio follows rendering automatically. Do not repeatedly poll jobs. Never claim completion until get_video_status says complete. To revise a video, get_video_project first, keep what the user liked, then call create_video with the complete updated plan. Each revision makes a new project and preserves the prior version. Do not send HTML/code as the final video. Use links returned by tools. AI narration must be disclosed. Captions currently use approximate phrase timing, not forced word alignment.`;
export async function configureForge() {
  const providers = await forgeRequest("/settings/model-providers");
  const manifest = {
    type: "openai",
    auth: { api_key: config.apiKey },
    models: [
      {
        name: config.model.replaceAll(".", "-"),
        model_id: config.model,
        properties: {},
      },
    ],
  };
  // This app owns an isolated TrueForge database. Preserve other configured models on restarts.
  const existing = (providers.data || []).find(
    (p: any) =>
      p.name === "openai" ||
      p.manifest?.type === "openai" ||
      p.type === "openai",
  );
  if (!existing)
    await forgeRequest("/settings/model-providers", "POST", { manifest });
  else {
    const models = existing.manifest.models.filter(
      (m: any) => m.name !== manifest.models[0].name,
    );
    await forgeRequest("/settings/model-providers", "PUT", {
      manifest: {
        ...existing.manifest,
        auth: manifest.auth,
        models: [...models, ...manifest.models],
      },
    });
  }
  const servers = await forgeRequest("/settings/mcp-servers");
  const hasServer = (servers.data || []).some(
    (s: any) =>
      s.name === "educative-video" || s.manifest?.name === "educative-video",
  );
  await forgeRequest("/settings/mcp-servers", hasServer ? "PUT" : "POST", {
    manifest: {
      type: "remote",
      name: "educative-video",
      description:
        "Create local narrated explainer videos, inspect projects, and track render jobs.",
      url: `${studioUrl}/mcp`,
    },
  });
  const agents = await forgeRequest("/agents");
  const spec = {
    model: { name: `openai/${config.model.replaceAll(".", "-")}` },
    instructions,
    mcp_servers: [
      {
        name: "educative-video",
        preload: true,
        require_approval_for_tools: [],
      },
    ],
    config: {
      dynamic_sub_agents: { enabled: true },
      sandbox: { enabled: false },
      generative_ui: { enabled: false },
      ask_user_questions: { enabled: false },
      iteration_limit: 20,
    },
  };
  const agent = agents.data.find((a: any) => a.name === agentName);
  if (!agent)
    await forgeRequest("/agents", "POST", {
      name: agentName,
      description:
        "Turn a topic into a narrated vertical explainer with local video tools.",
      manifest: spec,
    });
  else
    await forgeRequest(`/agents/${agent.id}`, "PUT", {
      description:
        "Turn a topic into a narrated vertical explainer with local video tools.",
      manifest: spec,
    });
}
