import "dotenv/config";
import path from "node:path";
export const config = {
  root: process.cwd(),
  data: path.resolve(".data"),
  projects: path.resolve(".data/projects"),
  port: Number(process.env.STUDIO_PORT || 8789),
  forgePort: Number(process.env.PORT || 8790),
  model: process.env.OPENAI_MODEL || "gpt-6-astra",
  reasoning: process.env.OPENAI_REASONING_EFFORT || "high",
  ttsModel: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  apiKey: process.env.OPENAI_API_KEY || "",
};
export const studioUrl = `http://127.0.0.1:${config.port}`;
export const forgeUrl = `http://127.0.0.1:${config.forgePort}`;
