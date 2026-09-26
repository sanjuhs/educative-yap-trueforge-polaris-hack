import { z } from "zod";
export const motionSchema = z.object({
  html: z
    .string()
    .min(1)
    .max(45000)
    .describe(
      "Custom HTML/SVG inside the 1080×1920 artboard. No scripts, iframes, external URLs or event attributes. For declared clips, use host-managed img data-clip-id with data-scene and data-offset. Images: imported visual-<id> paths declared in visualAssetIds, cafe.png, inline SVG and data images are allowed.",
    ),
  css: z
    .string()
    .max(35000)
    .describe(
      "Original CSS for this video. Build any layout; no fixed scene templates. No CSS animations or transitions: use deterministic JavaScript.",
    ),
  javascript: z
    .string()
    .min(1)
    .max(50000)
    .describe(
      "JavaScript executed once. Define window.renderFrame = (time, duration, scenes) => { ... }; it MUST deterministically set ALL visual state for any timestamp, including backwards seeks. GSAP available; use a paused timeline and seek(time, false), or Canvas/SVG. No fetch, imports, timers, requests, eval, wall clock or randomness. scenes contains actual start/duration. Do not generate audio/captions; host supplies them.",
    ),
});
export const placementSchema = z
  .object({
    x: z.number().min(0).max(920),
    y: z.number().min(0).max(1760),
    width: z.number().min(160).max(1080),
    height: z.number().min(160).max(1920),
  })
  .refine(
    (p) => p.x + p.width <= 1080 && p.y + p.height <= 1920,
    "Presenter rectangle must fit the artboard",
  );
