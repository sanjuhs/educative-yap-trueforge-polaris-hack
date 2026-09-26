import { z } from "zod";
export const sceneSchema = z.object({
  startSeconds: z
    .number()
    .min(0)
    .max(60)
    .optional()
    .describe(
      "Presenter mode only: when this visual begins in the original recording; first scene starts at 0",
    ),
  title: z.string().min(1).max(65).describe("Short, punchy on-screen headline"),
  narration: z
    .string()
    .min(1)
    .max(450)
    .describe("Natural spoken narration, 12–25 words per scene"),
  visual: z
    .enum(["orbit", "comparison", "steps", "bars", "statement"])
    .describe("Choose a visual that explains the idea"),
  labels: z
    .array(z.string().min(1).max(40))
    .min(1)
    .max(4)
    .describe("Concise diagram labels; bars require values in matching order"),
  values: z
    .array(z.number().min(0).max(100))
    .max(4)
    .default([])
    .describe("Bar lengths only, 0–100. Do not invent factual statistics"),
  accent: z.enum(["lime", "coral", "blue", "violet"]).default("lime"),
});
export const planSchema = z
  .object({
    presenterAssetId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Uploaded presenter recording ID; keeps the real video and voice, never generates TTS",
      ),
    title: z.string().min(1).max(90),
    summary: z.string().min(1).max(400),
    voice: z.enum(["marin", "cedar", "coral", "alloy"]).default("marin"),
    music: z
      .boolean()
      .default(true)
      .describe("Add a quiet original synthesized ambient bed"),
    scenes: z.array(sceneSchema).min(3).max(6),
  })
  .superRefine((plan, ctx) => {
    const words = plan.scenes.reduce(
      (sum, s) => sum + s.narration.trim().split(/\s+/).length,
      0,
    );
    if (!plan.presenterAssetId && words > 135)
      ctx.addIssue({
        code: "custom",
        message: "Keep the whole script at 135 words or fewer.",
      });
    plan.scenes.forEach((s, i) => {
      if (s.visual === "comparison" && s.labels.length !== 2)
        ctx.addIssue({
          code: "custom",
          path: ["scenes", i, "labels"],
          message: "A comparison requires exactly two labels.",
        });
      if (s.visual === "bars" && s.values.length !== s.labels.length)
        ctx.addIssue({
          code: "custom",
          path: ["scenes", i, "values"],
          message: "Each bar label needs a matching value.",
        });
    });
  });
export type Plan = z.infer<typeof planSchema>;
export type TimedScene = Plan["scenes"][number] & {
  start: number;
  duration: number;
  audio: string;
};
export type Project = {
  id: string;
  createdAt: string;
  status: "queued" | "narrating" | "rendering" | "complete" | "failed";
  progress: string;
  plan: Plan;
  scenes?: TimedScene[];
  duration?: number;
  error?: string;
};
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
