import { z } from "zod";

export const MAX_VIDEO_SECONDS = 1200;
export const DURATION_TOLERANCE = 6;
export const SCENE_PAUSE = 0.25;
export const targetDurationSchema = z
  .number()
  .int()
  .min(5)
  .max(MAX_VIDEO_SECONDS)
  .multipleOf(5);
export function durationRange(target: number) {
  return {
    min: Math.max(1, target - DURATION_TOLERANCE),
    max: target + DURATION_TOLERANCE,
  };
}
export function wordBudget(target: number) {
  return {
    aim: Math.max(6, Math.round(target * 2.1)),
    max: Math.ceil((target + DURATION_TOLERANCE) * 2.6),
  };
}
export function renderTimeout(duration: number) {
  return Math.max(900_000, Math.ceil(duration * 6000));
}
// Keep natural delivery. A grossly mismatched script needs rewriting, not stretching.
export function narrationTempo(durations: number[], target?: number) {
  const total = durations.reduce((sum, d) => sum + d + SCENE_PAUSE, 0);
  if (target === undefined) return 1;
  targetDurationSchema.parse(target);
  const range = durationRange(target);
  if (total >= range.min && total <= range.max) return 1;
  const speech = durations.reduce((sum, d) => sum + d, 0);
  const tempo = speech / (target - durations.length * SCENE_PAUSE);
  if (!Number.isFinite(tempo) || tempo < 0.85 || tempo > 1.18)
    throw new Error(
      `Narration is ${total.toFixed(1)}s for a ${target}s target (±6s). ${total > target ? "Shorten" : "Expand"} the script and create a new version; fitting it would make speech unnatural.`,
    );
  return tempo;
}
export function estimatedTimeline<T extends { narration: string }>(
  scenes: T[],
  target?: number,
) {
  const weights = scenes.map(
    (s) =>
      Math.max(1, s.narration.trim().split(/\s+/).length) / 2.1 + SCENE_PAUSE,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let start = 0;
  return scenes.map((s, i) => {
    const duration =
      target === undefined ? weights[i] : (weights[i] * target) / total;
    const timed = { ...s, start, duration, audio: "" };
    start += duration;
    return timed;
  });
}
