# Inspect a real Yap run

This trace follows the September 26, 2026 Korean War explainer. GPT-6 Astra/high directed the animation and reviewed frames. The final audited export is 60.17 seconds at 1080×1920, with eight narration beats, two photographs and a four-second archival excerpt.

[Sanitized event JSON](korean-war.json) · [Full experiment and final audit](../experiments/korean-war.md) · [Contact sheet](../showcase/korean-war.jpg)

## What was exported

The JSON selects fields from the saved `initial-events.json`, `events.json` and `cost.json` under the ignored local experiment directory. It preserves all 27 event positions across two director turns, tool names, selected arguments, timestamps where recorded, review critiques, terminal state and usage. It omits prompts, assistant prose, generated source, identifiers, local URLs and search-result bodies. It is a sanitized excerpt, not the full raw session or hidden reasoning.

The local experiment preceded the hosted deployment. Its projects and cost records were imported into hosted history; the old live TrueForge session was not. New hosted sessions persist in the private orchestrator volume.

## The sequence

Times below are UTC. Summaries are editorial descriptions; exact retained fields are in the JSON.

| Time           | Recorded action                                                                           | Why it matters                                                             |
| -------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 09:30:43       | Initialize the selected TrueForge MCP profile                                             | The actual harness owns the turn and calls Yap's tools                     |
| 09:30–09:31    | Search images and YouTube; import two photographs and a 30–34-second excerpt              | Assets have source URLs and permission metadata                            |
| Initial turn   | The footage review identifies military equipment in a clip titled about ceasefire talks   | The title is not treated as proof of what appears in the frames            |
| Initial turn   | `preview_design` returns REVISE: legends, city label and boundary graphic need correction | The critique comes from rendered frames, not just generated source         |
| Initial turn   | A separate asset-inspection preview returns READY                                         | A successful photo check is distinct from the finished animation           |
| Initial turn   | Revised animation returns REVISE: map layer covers headings and the map key needs repair  | Review can reject the next draft too                                       |
| 09:40:43       | Turn ends `cancelled`, reason `server-execution-timeout`                                  | An incomplete attempt is preserved in the evidence and total cost          |
| 09:45:34       | User continuation resumes the session with specific repairs                               | This was an explicit continuation, not automatic recovery                  |
| Continued turn | `preview_design` returns READY with remaining caveats                                     | The repaired design separates the 38th parallel and later demarcation line |
| 09:47:45       | `render_design` returns a queued project                                                  | The model hands off to the render worker                                   |
| 09:47:50       | Director turn ends `done`                                                                 | Agent completion and media-render completion are separate states           |

The final audit later found and repaired a missing TTS phrase and rebuilt captions with word timestamps. Those were manual artifact repairs and are not claimed as automatic agent behavior. The [experiment report](../experiments/korean-war.md) describes those steps and remaining quality limitations.

## Cost you can check

The combined record includes successful direct visual-review usage as well as TrueForge director usage. Direct reviews are not separate model events in the exported director trace. There were **14 recorded model calls, including five visual reviews**.

| Token category           | Recorded count | Interpretation                     |
| ------------------------ | -------------: | ---------------------------------- |
| Input                    |        260,763 | Includes cached reads and writes   |
| Cache reads              |        197,045 | Subset of input                    |
| Cache writes             |         63,228 | Subset of input                    |
| Remaining ordinary input |            490 | Input minus reads minus writes     |
| Output                   |         37,989 | Includes reasoning                 |
| Reasoning                |         13,927 | Subset of output; do not add twice |

Using the September 26, 2026 short-context Standard Astra rates from [OpenAI API pricing](https://developers.openai.com/api/docs/pricing):

```text
Direction + review = (490 × $10 + 197,045 × $1
                      + 63,228 × $12.50 + 37,989 × $50) / 1,000,000
                   = $2.891745

Narration estimate (original + replacement) = $0.016625
Audio transcription checks estimate         = $0.007800
Full recorded experiment estimate          = $2.916170

Same tokens, ordinary uncached input rate  = $4.507080
Net caching discount                       = $1.615335
```

The uncached baseline reprices all recorded input at $10/million, keeping output fixed. It measures a rate-card difference for the same tokens, including the cache-write premium. It does not show how another harness, model or editing workflow would perform. Compute, storage, network, licensing, unreported failed/interrupted usage and account-specific discounts are excluded. This is not an invoice. The final project's cost panel covers its recorded generation turn, not this whole experiment.

## Inspect your own run

1. Start Yap locally and submit a brief. The **Open TrueForge** link opens the local harness UI at `http://127.0.0.1:8790`.
2. Find the matching session and turn. Inspect tool calls and responses, preview critiques, terminal status and token usage. Follow additional event pages when inspecting a long trace.
3. In Yap, open the resulting project and inspect **Animation source**, credits and **AI cost estimate**. Choose **Revise this video** to exercise `get_video_project` → `preview_design` → `render_design` while retaining the earlier project.
4. Compare the entire sequence, including unsuccessful attempts, before reporting its cost. Local usage ledgers live in `.data/usage/`; project render logs live under `.data/projects/`.

The app also exposes `GET /api/turns/:session/:turn/events` for the first 100 events. In hosted mode this requires an authenticated account owning both the session and turn. The private TrueForge endpoint supports event pagination; the usage collector follows it. The hosted studio deliberately does not expose the harness dashboard. Do not make that unauthenticated local interface public.

## Follow the implementation

- [Director instructions and model-profile setup](../../src/trueforge.ts)
- [MCP source, preview, render and revision tools](../../src/server.ts)
- [Preview execution and authored animation](../../src/authored.ts)
- [Vision review](../../src/vision-review.ts)
- [Usage collection and estimation](../../src/usage.ts)
- [Hosted job lifecycle](../../src/hosted/jobs.ts)
- [Modal renderer isolation](../../deployment/modal-renderer.md)
