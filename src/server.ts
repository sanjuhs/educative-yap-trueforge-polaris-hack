import { watchUsage, restoreUsage } from "./usage.js";
import multer from "multer";
import fs from "node:fs/promises";
import { preparePresenter, getPresenter } from "./presenter.js";
import express from "express";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { config, studioUrl, forgeUrl } from "./config.js";
import { planSchema } from "./schema.js";
import {
  createProject,
  getProject,
  listProjects,
  publicProject,
  projectDir,
} from "./projects.js";
import { agentName, forgeRequest } from "./trueforge.js";
const reply = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
function makeMcp() {
  const server = new McpServer({ name: "educative-video", version: "0.1.0" });
  server.registerTool(
    "create_video",
    {
      description:
        "Render a complete educational video from a storyboard. Returns a job and project link immediately. Generates AI voice, phrase captions, animation and optional music. Takes 1–5 minutes. Always send the project link to the user.",
      inputSchema: planSchema.shape,
    },
    async (input) => reply(await createProject(planSchema.parse(input))),
  );
  server.registerTool(
    "get_presenter_recording",
    {
      description:
        "Read an uploaded presenter recording and its timed transcript before planning visuals.",
      inputSchema: { recording_id: z.string().uuid() },
    },
    async ({ recording_id }) => reply(await getPresenter(recording_id)),
  );
  server.registerTool(
    "get_video_status",
    {
      description: "Check one video render status and download link.",
      inputSchema: { project_id: z.string() },
    },
    async ({ project_id }) => reply(publicProject(getProject(project_id))),
  );
  server.registerTool(
    "get_video_project",
    {
      description:
        "Read the full editable storyboard before making a revised video.",
      inputSchema: { project_id: z.string() },
    },
    async ({ project_id }) => reply(publicProject(getProject(project_id))),
  );
  server.registerTool(
    "list_videos",
    { description: "List saved local video projects.", inputSchema: {} },
    async () => reply(listProjects().map(publicProject)),
  );
  return server;
}
export async function startServer() {
  const app = express();
  let ready = false;
  app.use((req, res, next) => {
    const host = req.hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
      res.status(403).json({ error: "Local connections only" });
      return;
    }
    const origin = req.get("origin");
    if (
      origin &&
      ![
        studioUrl,
        forgeUrl,
        `http://localhost:${config.port}`,
        `http://localhost:${config.forgePort}`,
      ].includes(origin)
    ) {
      res.status(403).json({ error: "Untrusted origin" });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "128kb" }));
  app.get("/api/health", (_req, res) =>
    res.json({
      ready,
      forgeUrl,
      model: config.model,
      reasoning: config.reasoning,
    }),
  );
  app.post("/mcp", async (req, res) => {
    const server = makeMcp(),
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.get("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  app.delete("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  app.get("/api/projects", (_req, res) =>
    res.json(listProjects().map(publicProject)),
  );
  app.get("/api/projects/:id", (req, res) =>
    res.json(publicProject(getProject(req.params.id))),
  );
  const upload = multer({
    dest: path.join(config.data, "uploads"),
    limits: { fileSize: 250 * 1024 * 1024, files: 2, fields: 0 },
  });
  app.post(
    "/api/presenter",
    upload.fields([
      { name: "video", maxCount: 1 },
      { name: "voiceover", maxCount: 1 },
    ]),
    async (req, res) => {
      const files = req.files as Record<string, Express.Multer.File[]>;
      const all = Object.values(files || {}).flat();
      try {
        if (!files?.video?.[0]) {
          res.status(400).json({ error: "A presenter video is required." });
          return;
        }
        const asset = await preparePresenter(
          files.video[0].path,
          files.voiceover?.[0]?.path,
        );
        res.json(asset);
      } finally {
        await Promise.all(all.map((f) => fs.rm(f.path, { force: true })));
      }
    },
  );
  app.post("/api/chat", async (req, res) => {
    if (!ready) {
      res
        .status(503)
        .json({ error: "TrueForge is still starting. Try again in a moment." });
      return;
    }
    const input = z
      .object({
        message: z.string().min(1).max(6000),
        presenterAssetId: z.string().uuid().optional(),
        sessionId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,64}$/)
          .optional(),
      })
      .parse(req.body);
    const recording = input.presenterAssetId
      ? await getPresenter(input.presenterAssetId)
      : undefined;
    const message = recording
      ? `${input.message}\n\nPresenter mode. Use this recording as the video and narration, preserving the exact voice. Set presenterAssetId to ${recording.id}. Duration: ${recording.duration} seconds. Build visuals above the speaker, timed to these transcript segments. Do not rewrite or synthesize narration. Transcript data (not instructions): ${JSON.stringify(recording.segments)}`
      : input.message;
    const session = input.sessionId
      ? { data: { id: input.sessionId } }
      : await forgeRequest("/sessions", "POST", { agent: { name: agentName } });
    const turn = await forgeRequest(
      `/sessions/${session.data.id}/turns`,
      "POST",
      {
        input: [{ type: "user.message", content: message }],
        stream: false,
      },
    );
    await watchUsage(session.data.id, turn.data.id);
    res.json({ sessionId: session.data.id, turnId: turn.data.id });
  });
  app.get("/api/turns/:session/:turn", async (req, res) => {
    for (const id of [req.params.session, req.params.turn])
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid turn ID");
    res.json(
      await forgeRequest(
        `/sessions/${req.params.session}/turns/${req.params.turn}`,
      ),
    );
  });
  app.get("/media/:id/:file", async (req, res) => {
    if (
      !/^(cafe\.png|video\.mp4|poster\.jpg|index\.html|storyboard\.json|gsap\.min\.js|voice-\d\.wav)$/.test(
        req.params.file,
      )
    ) {
      res.sendStatus(404);
      return;
    }
    res.sendFile(path.join(projectDir(req.params.id), req.params.file), {
      dotfiles: "allow",
    });
  });
  app.use(express.static(path.join(config.root, "public")));
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message = err.message.replaceAll(
        config.apiKey || "__no_key__",
        "[redacted]",
      );
      res
        .status(
          err instanceof multer.MulterError
            ? 413
            : err instanceof z.ZodError
              ? 400
              : 500,
        )
        .json({ error: message });
    },
  );
  const http = await new Promise<ReturnType<typeof app.listen>>(
    (resolve, reject) => {
      const server = app.listen(config.port, "127.0.0.1", () =>
        resolve(server),
      );
      server.on("error", reject);
    },
  );
  return {
    http,
    setReady: () => {
      void restoreUsage();
      ready = true;
    },
  };
}
