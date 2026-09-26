import { z } from "zod";

export const creativeBriefSchema = z.object({
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
  "screen-demo",
  "mixed",
]);

export function creativeBriefMessage(value: CreativeBrief) {
  const brief = creativeBriefSchema.parse(value);
  const sourcing =
    brief.webImagePercent === 0
      ? "Use original diagrams, SVG, Canvas or HTML only. Do not search for or import internet images for this request."
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
Copy this brief into preview_design.creativeBrief. Classify each scene using shotKind (diagram, animation, photo, screen-demo or mixed) and explain its teaching purpose in visualIntent. A screen-demo must depict relevant interface behavior; do not describe a drawing as captured footage.
Moving B-roll/video imports are not currently supported. Do not claim to have fetched a clip or disguise a still as footage. If video footage is essential, say what clip is needed.
Creative brief JSON: ${JSON.stringify(brief)}`;
}
