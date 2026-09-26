import { defaultGeneration, type GenerationSettings } from "./model-options.js";
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { config } from "./config.js";
import type { Plan } from "./schema.js";
export async function reviewFrames(
  dir: string,
  plan: Plan,
  times: number[],
  settings: GenerationSettings = defaultGeneration(),
) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    timeout: 120000,
    maxRetries: 0,
  });
  const content: OpenAI.Responses.ResponseInputContent[] = [
    {
      type: "input_text",
      text: `You are the visual editor for a short explainer. Inspect these actual preview frames at ${times.join(", ")} seconds. Topic: ${plan.title}. Intention: ${plan.summary}. Presenter ${plan.presenterAssetId ? `will be overlaid in ${JSON.stringify(plan.presenterPlacement || { x: 500, y: 1000, width: 580, height: 920 })}` : "is not present"}. Captions are supplied by the host. Briefly report specific visible clipping, overlap, factual visual errors, small text and unexplained objects. Do not invent motion you cannot see from stills. An intentional scene transition can show overlap. If clear enough to render, say READY; otherwise say REVISE and give at most 3 actionable changes. End with a one-sentence account of what you actually see.`,
    },
  ];
  for (let i = 0; i < times.length; i++)
    content.push({
      type: "input_image",
      image_url:
        "data:image/png;base64," +
        (await fs.readFile(path.join(dir, `preview-${i}.png`))).toString(
          "base64",
        ),
      detail: "high",
    });
  const response = await client.responses.create({
    model: settings.model,
    reasoning: { effort: settings.reasoning },
    max_output_tokens: 2000,
    input: [{ role: "user", content }],
  });
  if (!response.output_text.trim())
    throw new Error("Vision review returned no critique; retry the preview.");
  return {
    model: response.model,
    reasoning: settings.reasoning,
    critique: response.output_text,
    usage: response.usage,
    responseId: response.id,
  };
}
