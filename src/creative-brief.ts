import { z } from "zod";
import { targetDurationSchema, wordBudget } from "./duration.js";

export const creativeBriefSchema = z
  .object({
    targetDurationSeconds: targetDurationSchema
      .optional()
      .describe(
        "Requested AI-voice runtime in 5-second steps, 5–1200 seconds; tolerance ±6 seconds. Presenter duration comes from the original recording.",
      ),
    footage: z.enum(["auto", "off"]).default("auto"),
    footagePercent: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe(
        "Soft target for footage as a percentage of total visual screen time. Zero disables footage. Omit for legacy automatic selection.",
      ),
    openingStyle: z
      .enum(["auto", "clip-first", "dynamic-graphics"])
      .default("auto"),
    webImagePercent: z.number().int().min(0).max(100).default(40),
    explanationType: z
      .enum(["auto", "mechanism", "comparison", "timeline", "walkthrough"])
      .default("auto"),
    pacing: z.enum(["calm", "balanced", "brisk"]).default("balanced"),
    textDensity: z.enum(["minimal", "labels", "balanced"]).default("labels"),
    notes: z.string().max(1500).default(""),
  })
  .refine(
    (brief) =>
      brief.footage === "off" ||
      brief.footagePercent === undefined ||
      brief.webImagePercent + brief.footagePercent <= 100,
    {
      message: "Photo and footage screen-time targets must total at most 100%",
      path: ["footagePercent"],
    },
  );
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;
export const shotKindSchema = z.enum([
  "diagram",
  "animation",
  "photo",
  "b-roll",
  "screen-demo",
  "mixed",
]);

export function creativeBriefMessage(value: CreativeBrief) {
  const brief = creativeBriefSchema.parse(value);
  const footageEnabled = brief.footage !== "off" && brief.footagePercent !== 0;
  const footagePercent = footageEnabled ? brief.footagePercent : 0;
  const sourcing =
    brief.webImagePercent === 0
      ? "Use original diagrams, SVG, Canvas or HTML for the non-footage portions. Do not search for or import internet images for this request."
      : `Aim for about ${brief.webImagePercent}% of visual screen time to prominently feature relevant internet photographs, of the full video. Footage has its own separate screen-time target; original explanatory graphics fill the remaining time. This is a soft editorial target, not a count of assets. Photos may have animated annotations. Never fill the quota with irrelevant pictures; explain any shortfall.`;
  const pacing = {
    calm: "Let major shots breathe for roughly 5–8 seconds, with slower meaningful builds.",
    balanced:
      "Use roughly 3–5 seconds per major shot, with meaningful intermediate changes.",
    brisk:
      "Use roughly 2–3 seconds per major shot, with quick purposeful cuts and builds. Preserve reading time and narration alignment; avoid flashing.",
  }[brief.pacing];
  return `\n\nUSER CREATIVE BRIEF (overrides generic visual preferences):
${brief.targetDurationSeconds ? `DURATION: Target ${brief.targetDurationSeconds} seconds, tolerance ±6 seconds. Aim for roughly ${wordBudget(brief.targetDurationSeconds).aim} narration words total, adjusting for pauses. For longer videos write substantial chapters with distinct explanatory beats; never pad a short script with repeated shots or long holds. For 5–10 seconds explain one point. Duration overrides default short-video guidance. Copy targetDurationSeconds into the design creativeBrief. Presenter recordings retain their original duration and voice.` : ""}
${sourcing}
${footagePercent === undefined ? "Footage amount: choose brief relevant inserts where they help explain the topic." : `Visual mix across the full video: ${brief.webImagePercent}% photos, ${footagePercent}% footage, about ${100 - brief.webImagePercent - footagePercent}% original diagrams/animations. These are soft screen-time targets, not asset counts; overlaps and useful animated overlays are welcome. Never loop irrelevant clips or pad narration to fill a quota. State a shortfall if suitable footage is unavailable or clip limits prevent the requested share.`}
Opening: ${brief.openingStyle === "clip-first" ? "Prefer a relevant, striking 3–5 second real footage excerpt at the beginning, with narration that immediately explains its connection to the topic. If footage is disabled or no suitable source is available, open with an original dynamic visual and disclose the fallback. Do not spend the opening on a static title card." : brief.openingStyle === "dynamic-graphics" ? "Start with a strong original animated visual in the first 3–5 seconds: show an action, change, comparison or mechanism immediately. Avoid a static title card." : "Choose a relevant footage hook or original dynamic visual for the first 3–5 seconds. Establish the point quickly, without a long title card."}
Explanation structure: ${brief.explanationType === "auto" ? "Choose the best structure for this topic" : brief.explanationType}. This selects a teaching approach, never a fixed layout/template.
Pacing: ${pacing}
On-screen text: ${brief.textDensity === "minimal" ? "Visuals first; only indispensable labels, no paragraph cards" : brief.textDensity === "labels" ? "Short labels, tiny meaningful code fragments and short headlines" : "Concise explanatory text where useful, never a transcript slideshow"}. Host captions remain available.
Copy this brief into preview_design.creativeBrief. Classify each scene using shotKind (diagram, animation, photo, b-roll, screen-demo or mixed) and explain its teaching purpose in visualIntent. A screen-demo must depict relevant interface behavior; do not describe a drawing as captured footage.
${!footageEnabled ? "Do not search or import footage for this request." : "Search saved indexed assets first with search_saved_assets using the topic, date, place and intended action. Reuse a saved clip only if its inspected content and provenance actually fit; saved does not mean permission-cleared. Then autonomously search YouTube for useful supporting footage with search_youtube_clips. Select and inspect 3–5 second excerpts with import_youtube_clip; use relevant ones as B-roll through clipAssetIds. Do not ask the user for links. Avoid repeated failed downloads; if a source is inaccessible, try another public source or use diagrams and disclose the limitation. Record creators and source metadata for credits; permission stays pending. Prefer credible primary/archive channels for historical subjects and never infer an event/date from search keywords alone."}
Creative brief JSON: ${JSON.stringify(brief)}`;
}
