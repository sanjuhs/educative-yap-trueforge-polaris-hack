import { clipIdsSchema } from "./video-clips.js";
import { creativeBriefSchema, shotKindSchema } from "./creative-brief.js";
import { defaultGeneration, type GenerationSettings } from "./model-options.js";
import { reviewFrames } from "./vision-review.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { planSchema, type Plan } from "./schema.js";
import { getPresenter, presenterTimeline } from "./presenter.js";
import { run, rendererEnv } from "./process.js";

import { motionSchema, placementSchema } from "./motion-schema.js";
export const authoredInputSchema = z.object({
  clipAssetIds: clipIdsSchema
    .optional()
    .describe(
      'Imported clip IDs. Place footage with <img data-clip-id="ID" data-scene="0" data-offset="0">. Host synchronizes 30fps frames to that scene; clip is hidden outside its duration. Animate a wrapper for overlays/transitions; do not change the image src. All clip audio is muted.',
    ),
  creativeBrief: creativeBriefSchema
    .optional()
    .describe(
      "Copy the supplied user creative brief; its mix and pacing are editorial targets, not fixed templates.",
    ),
  title: z.string().min(1).max(90),
  summary: z.string().min(1).max(400),
  presenterAssetId: z.string().uuid().optional(),
  presenterMode: z
    .enum(["cutout", "split"])
    .default("cutout")
    .describe(
      "cutout: remove original background and overlay presenter on your full-screen design; split: retain original lower-panel video",
    ),
  presenterPlacement: placementSchema
    .optional()
    .describe(
      "In cutout mode, position the presenter freely. Reserve this rectangle in your design. Default x=500,y=1000,width=580,height=920.",
    ),
  voice: z.enum(["marin", "cedar", "coral", "alloy"]).default("marin"),
  music: z.boolean().default(false),
  scenes: z
    .array(
      z.object({
        startSeconds: z.number().min(0).max(60).optional(),
        title: z.string().min(1).max(65),
        narration: z.string().min(1).max(450),
        visualIntent: z.string().max(400).optional(),
        shotKind: shotKindSchema
          .optional()
          .describe(
            "Classify the visual medium actually authored for this scene.",
          ),
      }),
    )
    .min(1)
    .max(16),
  motion: motionSchema,
});
export type AuthoredInput = z.infer<typeof authoredInputSchema>;
export function authoredPlan(input: AuthoredInput): Plan {
  const p = authoredInputSchema.parse(input);
  return planSchema.parse({
    ...p,
    scenes: p.scenes.map((s) => ({
      ...s,
      visual: "statement",
      labels: [s.title],
    })),
  });
}
export function designDir(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid design ID");
  return path.join(config.data, "designs", id);
}
export async function readDesign(id: string): Promise<Plan> {
  return planSchema.parse(
    JSON.parse(
      await fs.readFile(path.join(designDir(id), "plan.json"), "utf8"),
    ),
  );
}
export async function previewDesign(
  input: AuthoredInput,
  settings: GenerationSettings = defaultGeneration(),
) {
  const plan = authoredPlan(input),
    id = randomUUID(),
    dir = designDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "plan.json"),
    JSON.stringify(plan, null, 2),
  );
  const asset = plan.presenterAssetId
    ? await getPresenter(plan.presenterAssetId)
    : undefined;
  const scenes = asset
    ? presenterTimeline(plan, asset)
    : plan.scenes.map((s, i) => ({
        ...s,
        start: i * 6,
        duration: 6,
        audio: "",
      }));
  const duration = asset?.duration || scenes.length * 6;
  await fs.writeFile(
    path.join(dir, "render-input.json"),
    JSON.stringify({
      plan,
      scenes,
      duration,
      captions: asset?.captions || [],
      preview: true,
    }),
  );
  await run(
    process.execPath,
    ["--import", "tsx", path.join(config.root, "src/authored-worker.ts"), dir],
    { timeout: 120000, env: rendererEnv() },
  );
  const report = JSON.parse(
    await fs.readFile(path.join(dir, "preview.json"), "utf8"),
  );
  report.visionReview = await reviewFrames(dir, plan, report.times, settings);
  await fs.writeFile(path.join(dir, "preview.json"), JSON.stringify(report));
  return { id, dir, report };
}
