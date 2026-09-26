# Model choice and video costs

Choose **AI director** and **Reasoning effort** in the studio before submitting a topic or revision. GPT-6 Luna, Sol and Astra support low, medium, high, xhigh and max in this app. The same selection applies to both the TrueForge director and the direct OpenAI visual review. Existing defaults remain `OPENAI_MODEL=gpt-6-astra` and `OPENAI_REASONING_EFFORT=high`; browser selections persist locally. Start with **Sol/high** for original animation coding, try **Luna/medium** for inexpensive drafts, and compare against **Astra/high** on demanding work. These are starting recommendations, not measured quality rankings for this app.

The model still authors the complete animation source. A cheaper model does not switch to fixed templates. Internet images and custom SVG/Canvas/HTML graphics do not require an image-generation API call. Image search and import still consume director context; source attribution accompanies imported assets.

## What 30 seconds might cost

The website shows illustrative **USD planning budgets**, not a fixed video price or spending limit:

| Model       | Editing + review | With about 30 seconds of AI narration |
| ----------- | ---------------: | ------------------------------------: |
| GPT-6 Luna  |   $0.0045–$0.040 |                         $0.012–$0.048 |
| GPT-6 Sol   |    $0.090–$0.800 |                         $0.098–$0.808 |
| GPT-6 Astra |    $0.450–$4.000 |                         $0.458–$4.008 |

These scenarios assume an aggregate 20,000 input / 4,000 output tokens through 200,000 input / 30,000 output tokens across editing and review calls, with each call below 128k input. Fresh inputs are priced as cache writes, including the write premium; no cache-read discount is assumed. They are **not benchmark results**. Reasoning, source length, conversation history and repair count drive usage more directly than video duration. Complex tasks can exceed the range. Higher effort has the same token rates but can change the number of tokens and iterations; lower effort does not guarantee a cheaper successful result.

Imported 30-second recordings allocate about $0.003 for Whisper transcription. Reusing an existing recording avoids another transcription call. AI narration uses a $0.015/minute duration estimate for `gpt-4o-mini-tts` (~$0.0075/30 seconds), not measured audio tokens. Other configured TTS models are explicitly unpriced. Local browser rendering, FFmpeg and presenter segmentation have no model-token charge; hosting and compute costs are separate.

## An observed workload, repriced

The existing **46-second HTML/CSS presenter sample** used Astra/high. Including its final visual review, the recorded workload was 207,585 input tokens (165,343 cached reads and 42,212 writes) and 28,905 output tokens, across 10 calls. Its estimated AI cost was **$2.1431**, including a $0.0046 transcription allocation.

At exactly those token counts and cache behavior, alternative rate cards would give **$0.4323 for Sol** or **$0.0260 for Luna**, including the same audio allocation. This is counterfactual repricing, not a claim that those models would use identical tokens or produce equally good videos. It is also not a measured 30-second price.

## First Luna run

A real run through the website with **Luna/medium** produced “HTML Builds, CSS Styles” with four scenes and 67 narration words. It used **144,996 input tokens and 26,514 output tokens** across nine model calls (including two visual reviews). The recorded editing/review estimate is **$0.01941082**; audio adds about **$0.0075**, for approximately **$0.0269** total. The run included animation repairs before a READY visual review. This is one sample with AI narration, not a controlled comparison against the presenter sample or a promise of quality/cost on other topics.

## Routing and accounting

- `GET /api/generation-options` exposes the allowlisted models, effort levels, rate card, defaults and estimate assumptions.
- `POST /api/chat` accepts `generation: { model: "gpt-6-luna", reasoning: "medium" }`. Invalid selections fail validation. There is no silent fallback to a more expensive model.
- Each model/effort combination has a separate TrueForge agent and MCP URL. Settings are bound to a session and persisted under `.data/session-profiles`. Selecting different settings starts a new session; explicit revision requests retain the chosen saved project's source.
- The MCP preview handler passes the same validated settings to the vision reviewer. Additional subagents are disabled for these profiles, so there are no hidden model choices.
- The usage ledger records the selected model and effort when a turn starts, and combines actual TrueForge tokens with successful visual-review usage. Cached reads, cache writes and reasoning are included in aggregate tokens and are not counted twice.
- The post-generation panel shows the resulting estimate, token categories, model calls, review count, audio allocation and net caching discount. Incomplete usage, unknown models, long-context calls or mixed-model runs remain unpriced instead of displaying a misleading total. Failed/retried API attempts that supply no usage are excluded and disclosed.

TrueForge provides orchestration, sessions and the usage events. Prompt-cache discounts are **OpenAI pricing behavior**, not proven TrueFoundry savings. A proper savings claim needs equivalent prompts and quality criteria, repeated trials, all retries, wall-clock measurements and a stated comparison baseline. Rendering and status polling already avoid model calls; report that architectural choice separately from caching.

Rate source: [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), checked September 26, 2026. Short-context Standard rates per million tokens:

| Model | Input | Cache read | Cache write | Output (including reasoning) |
| ----- | ----: | ---------: | ----------: | ---------------------------: |
| Astra |   $10 |         $1 |      $12.50 |                          $50 |
| Sol   |    $2 |      $0.20 |       $2.50 |                          $10 |
| Luna  | $0.10 |      $0.01 |      $0.125 |                        $0.50 |

Prices exclude account discounts and region/service-tier adjustments. Review this rate card as provider pricing changes.
