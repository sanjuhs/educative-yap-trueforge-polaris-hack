import { z } from "zod";
import { config } from "./config.js";

export const reasoningSchema = z.enum([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
export const modelSchema = z.enum(["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"]);
export const generationSchema = z.object({
  model: modelSchema,
  reasoning: reasoningSchema,
});
export type GenerationSettings = z.infer<typeof generationSchema>;
export function defaultGeneration(): GenerationSettings {
  return generationSchema.parse({
    model: config.model,
    reasoning: config.reasoning,
  });
}
export function profileName(settings: GenerationSettings) {
  const s = generationSchema.parse(settings);
  return `yap-${s.model}-${s.reasoning}`;
}

// Standard USD per million tokens, short context (<128k input per call).
// Verified against https://developers.openai.com/api/docs/pricing on 2026-09-26.
export const tokenRates: Record<
  string,
  { input: number; cached: number; output: number; write?: number }
> = {
  "gpt-6-astra": { input: 10, cached: 1, output: 50, write: 12.5 },
  "gpt-6-sol": { input: 2, cached: 0.2, output: 10, write: 2.5 },
  "gpt-6-luna": { input: 0.1, cached: 0.01, output: 0.5, write: 0.125 },
  "gpt-5.4": { input: 2.5, cached: 0.25, output: 15 },
};

export function generationOptions() {
  return {
    defaults: defaultGeneration(),
    recommended: { model: "gpt-6-sol", reasoning: "high" },
    reasoning: reasoningSchema.options,
    models: modelSchema.options.map((id) => {
      const rates = tokenRates[id];
      // Illustrative aggregate budgets across director + review calls, not benchmarks.
      // Treat fresh inputs as cache writes to include their premium; no cache-read savings assumed.
      const scenario = (input: number, output: number) =>
        (input * rates.write! + output * rates.output) / 1e6;
      return {
        id,
        label: {
          "gpt-6-luna": "Luna · Budget drafts",
          "gpt-6-sol": "Sol · Recommended balance",
          "gpt-6-astra": "Astra · Highest capability",
        }[id],
        rates,
        estimate: { low: scenario(20000, 4000), high: scenario(200000, 30000) },
      };
    }),
    estimateBasis:
      "30-second planning scenarios: 20k input + 4k output tokens through 200k input + 30k output tokens, across director and visual reviews. Fresh inputs priced as cache writes; no cache-read discount assumed. Each call must stay under 128k input. These are illustrative budgets, not measured model benchmarks or a spending cap. Repairs can exceed this range. Reasoning effort changes usage, not token prices.",
    audio: {
      presenter: 0.003,
      narrated: config.ttsModel === "gpt-4o-mini-tts" ? 0.0075 : null,
    },
    pricingDate: "2026-09-26",
    pricingSource: "https://developers.openai.com/api/docs/pricing",
  };
}
