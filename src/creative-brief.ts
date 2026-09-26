import { z } from "zod";

export const creativeBriefSchema = z.object({
  footage: z.enum(["auto", "off"]).default("auto"),
  webImagePercent: z.number().int().min(0).max(100).default(40),
  explanationType: z
    .enum(["auto", "mechanism", "comparison", "timeline", "walkthrough"])
    .default("auto"),
  pacing: z.enum(["calm", "balanced", "brisk"]).default("balanced"),
  textDensity: z.enum(["minimal", "labels", "balanced"]).default("labels"),
  notes: z.string().max(1500).default(""),
});
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
  const sourcing =
    brief.webImagePercent === 0
      ? "Use original diagrams, SVG, Canvas or HTML for the non-footage portions. Do not search for or import internet images for this request."
      : `Aim for about ${brief.webImagePercent}% of visual screen time to prominently feature relevant internet photographs, with the rest led by original explanatory graphics. This is a soft editorial target, not a count of assets. Photos may have animated annotations. Never fill the quota with irrelevant pictures; explain any shortfall.`;
  const pacing = {
    calm: "Let major shots breathe for roughly 5–8 seconds, with slower meaningful builds.",
    balanced:
      "Use roughly 3–5 seconds per major shot, with meaningful intermediate changes.",
    brisk:
      "Use roughly 2–3 seconds per major shot, with quick purposeful cuts and builds. Preserve reading time and narration alignment; avoid flashing.",
  }[brief.pacing];
  return `\n\nUSER CREATIVE BRIEF (overrides generic visual preferences):
${sourcing}
Explanation structure: ${brief.explanationType === "auto" ? "Choose the best structure for this topic" : brief.explanationType}. This selects a teaching approach, never a fixed layout/template.
Pacing: ${pacing}
On-screen text: ${brief.textDensity === "minimal" ? "Visuals first; only indispensable labels, no paragraph cards" : brief.textDensity === "labels" ? "Short labels, tiny meaningful code fragments and short headlines" : "Concise explanatory text where useful, never a transcript slideshow"}. Host captions remain available.
Copy this brief into preview_design.creativeBrief. Classify each scene using shotKind (diagram, animation, photo, b-roll, screen-demo or mixed) and explain its teaching purpose in visualIntent. A screen-demo must depict relevant interface behavior; do not describe a drawing as captured footage.
${brief.footage === "off" ? "Do not search or import footage for this request." : "Autonomously search YouTube for useful supporting footage with search_youtube_clips. Select and inspect 3–5 second excerpts with import_youtube_clip; use relevant ones as B-roll through clipAssetIds. Do not ask the user for links. Avoid repeated failed downloads; if a source is inaccessible, try another public source or use diagrams and disclose the limitation. Record creators and source metadata for credits; permission stays pending. Prefer credible primary/archive channels for historical subjects and never infer an event/date from search keywords alone."}
Creative brief JSON: ${JSON.stringify(brief)}`;
}
