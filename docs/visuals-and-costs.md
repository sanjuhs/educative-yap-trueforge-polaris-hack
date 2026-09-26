# Motion and usage metering

The director defaults to **gpt-6-astra with high reasoning**, called by TrueForge. `OPENAI_MODEL` and `OPENAI_REASONING_EFFORT` configure this. TrueForge's model metadata explicitly declares supported reasoning levels. A missing model or rejected reasoning setting surfaces an error; there is no silent fallback.

The director chooses scenes and timings. GSAP + HyperFrames execute deterministic animations and FFmpeg combines the presenter's video and original audio. Rendering and UI status polling use no additional model calls. This is an architectural property, not a measured token-savings comparison with a competing pipeline.

## HTML/CSS demonstration

The `web` scene has seven stages: technology overview, markup, rendered page, CSS styling, selector targeting, stylesheet linking, and delivery to a browser. The same fictional café page and bundled photographic asset recur throughout. Multi-step animations show changes in the object being explained, with short headlines and timed captions. `visualIntent` records why a scene was selected.

This first iteration adds a topic-specific visual vocabulary. It does not generate arbitrary motion design or custom footage for every topic. Other topics retain the original diagram styles and can use the café image only when relevant. Add new visual modules as sample explainers reveal what is needed.

Presenter clips retain their original duration and audio. HDR iPhone footage is tone-mapped to SDR. Portrait clips use a modest upper-center zoom over blurred sides in the lower panel; landscape clips fit. This crop is a heuristic, not face tracking. Source files and personal recordings stay in ignored `.data/`.

## Cost estimates

A background watcher persists each studio generation turn's TrueForge aggregate token metrics and associates only successful `create_video` responses with outputs. It follows paginated events and resumes pending tracking after restart. Browser tabs are not required for collection. Historical unmetered videos are shown as unmetered.

The panel reports input/output, cached input, reasoning, model call count, audio estimate, and cache discount. Cached tokens are part of input; reasoning is part of output. Neither is added twice. Direct OpenAI standard rates were checked on 2026-09-26 at https://developers.openai.com/api/docs/pricing:

| Model/service              | Input / 1M | Cached input / 1M | Output / 1M |
| -------------------------- | ---------: | ----------------: | ----------: |
| GPT-6 Astra, short context |        $10 |                $1 |         $50 |
| GPT-5.4, short context     |      $2.50 |             $0.25 |         $15 |

The estimator conservatively prices only single-model main-thread calls below 128,000 input tokens each, whose message usage reconciles with aggregate input. Unknown rates, mixed subagent calls, unpriced cache writes, long context, or incomplete usage produce unavailable dollar estimates instead of invented values. Astra cache writes cost $12.50/1M tokens. These are a subset of input and replace the ordinary input rate for those tokens. The net caching discount deducts the write premium from cache-read savings. The actual token aggregate remains visible. Multiple outputs from one turn share its director cost; it is not counted as an independent full cost for each video.

Whisper transcription is estimated at $0.006/minute of uploaded recording, rounded up to whole seconds. Revisions reuse the transcript without another transcription call; the UI shows the initial import allocation, not a fresh charge. Default TTS uses a rough $0.015/generated-minute estimate; binary speech responses do not supply measured audio tokens. Unsupported TTS models are unpriced.

The total is a generation estimate, not an invoice or account balance. It excludes earlier revisions, failed/retried API attempts, local compute, account-specific discounts, and the bundled image's one-time creation outside this app. The cache discount is the provider's prompt-caching discount, not a measured TrueFoundry savings claim. To demonstrate additional orchestration savings, run the same task with a defined baseline and compare all calls and outputs; that benchmark is not implemented yet.
