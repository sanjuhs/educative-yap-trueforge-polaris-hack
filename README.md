<div align="center">

![Educative Yap — an AI director that makes the edit](docs/showcase/hero.svg)

[![MIT](https://img.shields.io/badge/license-MIT-86dcb9)](LICENSE)
[![TrueForge](https://img.shields.io/badge/orchestrated_by-TrueForge-ff886b)](https://github.com/truefoundry/trueforge)
[![TypeScript](https://img.shields.io/badge/TypeScript-Node_22+-3178c6)](package.json)
[![Video](https://img.shields.io/badge/export-1080×1920_MP4-142d35)](docs/freeform-director.md)

**Give it an idea—or a recording of yourself teaching. Get an original animated explainer with narration, captions, sourced visuals and an editable project.**

[Hosted studio · invite only](https://educative-yap.vercel.app) · [Quick start](#run-it-locally) · [Real experiment](#a-real-one-minute-experiment) · [Agent workflow](#trueforge-does-the-work) · [Architecture](docs/architecture.md) · [Animation skill](skills/animate-explainers/SKILL.md)

</div>

## From an idea to a finished explanation

> “Explain the Korean War in one minute. Show how the front moved, why China intervened, and why the armistice did not reunify Korea. Use moving maps, archival imagery and subtitles.”

Yap's director writes narration, designs shots, finds useful images or footage, writes the animation source, inspects rendered previews, repairs problems and exports a vertical video. A revision can change the whole design. There is no required scene-template catalog.

| You direct                                        | Yap creates                                  |
| ------------------------------------------------- | -------------------------------------------- |
| Topic, script or teaching notes                   | A narrated sequence of explanatory beats     |
| Your video and voice                              | Presenter cutout or split-screen explanation |
| Duration, model, reasoning and visual preferences | A custom HTML/CSS/SVG/Canvas animation       |
| Feedback on the result                            | A new version with its own source and output |

## A real one-minute experiment

![Frames from the generated Korean War experiment: changing fronts, civilian consequences and the armistice boundary](docs/showcase/korean-war.jpg)

**60.17 seconds · eight beats · subtitles · two archival photographs · four seconds of sourced B-roll.**

The experiment used GPT-6 Astra/high and approximately **$2.92** in recorded model usage plus audio estimates, including the interrupted run, revisions and audio checks. It exposed real problems: a ten-minute agent timeout, overlapping map labels, an omitted TTS sentence and approximate captions. The final artifact was repaired and checked. This is evidence from one experiment—not a promised price or proof that every generation is ready to publish.

[Read the experiment and its limitations](docs/experiments/korean-war.md). Images credit R. V. Spencer and Donald Douglas George Bushby; source metadata accompanies generated projects. Clips retain source URLs, channel names, timestamps and permission status.

## TrueForge does the work

Built as a standalone open-source project for **Agents That Act: TrueFoundry × Polaris**. TrueForge runs the actual agent loop; it is not a decorative integration around a separate director.

```mermaid
flowchart LR
  B[Topic + creative brief] --> T[TrueForge director]
  T --> S[Search images and clips]
  S --> A[Imported assets + provenance]
  T --> C[Write original animation code]
  A --> P[Restricted preview renderer]
  C --> P
  P --> V[Visual review]
  V -->|Specific corrections| T
  V -->|Accepted preview| R[Narration + render worker]
  R --> O[MP4 + captions + source + credits]
  T -. trace and usage .-> H[Inspectable history]
```

| TrueForge capability    | How Yap uses it                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Stateful agent sessions | Keep the brief, tool results and revision context together                                                            |
| MCP tools               | Source assets, inspect excerpts, preview designs and enqueue renders                                                  |
| Model profiles          | Choose Luna, Sol or Astra and reasoning effort per session                                                            |
| Tool traces             | Inspect decisions, tool calls, errors and visual critiques                                                            |
| Agent/tool boundaries   | Separate creative direction from trusted media operations                                                             |
| Approval support        | Available in the harness; current local tools do not publish or contact creators, and require no interactive approval |

**Multiple-agent design:** research, direction and critique are useful separate roles. Today, one TrueForge director coordinates dedicated visual-review model calls. Dynamic subagents are disabled in the shipped profiles. A future research/critic subagent can return evidence or feedback while only the director commits the final plan. This avoids competing edits and duplicated renders. We do not claim a multi-agent swarm or measured orchestration savings that the current code does not demonstrate.

## Creative control without fixed templates

- **Custom motion:** causal diagrams, animated maps, procedural objects, camera movement and scene-specific compositions. The [animation skill](skills/animate-explainers/SKILL.md) is included in the director's instructions.
- **Your own visual library:** upload screenshots, photos and short video clips, select assets for a brief, and let the director arrange them. Imports retain descriptions and source metadata for reuse.
- **Visual mix and opening:** set a footage share, photo share, pacing, text density and opening preference—clip first, dynamic graphics or director’s choice.
- **Real visual assets:** Wikimedia image search and optional autonomous YouTube excerpt search/import. No user-provided link is required. Relevance is checked from actual frames; metadata alone is not historical evidence.
- **Your performance:** keep your original recording and voice, with background removal or a split-screen composition.
- **Duration:** AI-voice targets from 5 seconds to 20 minutes in 5-second steps, aiming within ±6 seconds. Presenter uploads currently support 3–60 seconds.
- **Model and budget:** selectable model/reasoning, illustrative estimates before generation, recorded token usage afterward. Rendering does not require a model call per frame.
- **Inspectable outputs:** MP4, storyboard, generated animation, source credits and traces. Previous projects remain available for comparison.

Long-duration input support is implemented, but twenty-minute production quality and runtime have not been benchmarked. Generated voice captions currently use approximate phrase timing unless a separate alignment pass is performed. [Duration limits](docs/duration-and-animation.md) · [Model costs](docs/model-costs.md) · [B-roll workflow](docs/broll-roadmap.md).

## Run it locally

Requires **Node.js 22.14+**, **FFmpeg** and an **OpenAI API key** with API access to the chosen model. Install FFmpeg with `brew install ffmpeg` on macOS or `sudo apt install ffmpeg` on Ubuntu.

```sh
npm ci
npx playwright install chromium
cp example.env .env
# Set OPENAI_API_KEY privately in .env.
npm start
```

Open **http://127.0.0.1:8789**. TrueForge's local interface is at **http://127.0.0.1:8790**. The launcher starts both services, configures the provider and model profiles, and registers Yap's MCP tools.

Optional YouTube support:

```sh
npm run setup:clips
# Restart the app after installation.
```

Local media and session data live in `.data/`, excluded from Git. Audio goes to the provider for narration/transcription, selected frames for visual critique, and text context to the director. The studio uses Google Fonts with fallbacks; video rendering uses local fonts and bundled GSAP.

### Teach with your own recording

Choose **Me + explainer visuals · My voice**, upload a video, then choose **Remove background** or **Split screen**. The uploaded voice is preserved. An optional separate voiceover must already align with the video and match its duration within 0.75 seconds. Files are limited to 250 MB each. Apple Vision is preferred on macOS, with a portable MediaPipe fallback. See [presenter and rendering details](docs/freeform-director.md).

## Standalone hosted architecture

The local studio is the starting point. The hosted implementation uses a separate Yap application, database/role, storage namespace and worker deployment. Make My Reels supplies infrastructure patterns, not application code or a runtime dependency.

```mermaid
flowchart TB
  U[Creator browser] --> W[Vercel studio + same-origin gateway]
  W --> API[Authenticated Yap API on VPS]
  API --> DB[(Yap Postgres)]
  API --> R2[(Encrypted Yap R2 objects)]
  API --> Q[Durable generation jobs]
  Q --> TF[Private TrueForge orchestrator]
  TF --> MCP[Owner-scoped Yap MCP tools]
  MCP --> MW[Trusted Modal adapter]
  MW --> SB[Disposable generated-code sandbox]
  SB --> MW
  MW --> API
```

**Hosted implementation:** authenticated accounts, owner-created users, Postgres history, durable jobs, encrypted R2 media and a persistent TrueForge volume. Deployment verification is recorded in [hosting](deployment/hosting.md). Vercel serves the web experience; long-running agent and media work belongs in the backend/workers. Modal is integrated explicitly through Yap's tools/adapter, not represented as a built-in TrueForge sandbox provider. Never expose the local unauthenticated TrueForge interface publicly. [Hosted environment example](deployment/hosted.env.example) · [R2, deployment and recovery guide](deployment/hosting.md) · [Isolated renderer](deployment/modal-renderer.md) · [Encrypted backup restore](deployment/runtime-backup.md).

**Verified live on September 26, 2026:** a screenshot upload became a 9.4-second Astra/high explainer with narration and captions, rendered on Modal and played from encrypted R2. Its recorded AI estimate was **$1.04**, excluding hosting, storage and rendering compute. Twelve earlier projects were imported; all thirteen projects remained available after a backend restart. The one-minute Korean War video retained playback, credits and recorded cost history. A 12 MB personal video clip also uploaded successfully through the public studio. [Release evidence and limits](deployment/demo-verification.md).

Future community, collaboration and mobile concepts are preserved in [product concepts](docs/product-concepts.md); they are not prerequisites for the creator studio or claims of shipped features.

## Configuration and development

`example.env` and `.env.example` contain placeholders. Never commit `.env`, provider keys or personal recordings.

| Variable                           | Default           | Purpose                        |
| ---------------------------------- | ----------------- | ------------------------------ |
| `OPENAI_API_KEY`                   | required          | Planning, review and speech    |
| `OPENAI_MODEL`                     | `gpt-6-astra`     | Default director               |
| `OPENAI_REASONING_EFFORT`          | `high`            | Default reasoning              |
| `OPENAI_TTS_MODEL`                 | `gpt-4o-mini-tts` | AI narration                   |
| `CUTOUT_BACKEND`                   | `auto`            | Presenter segmentation         |
| `STUDIO_PORT` / `PORT`             | `8789` / `8790`   | Local studio / TrueForge       |
| `SERVER_EXECUTION_TIMEOUT_SECONDS` | `1800`            | Agent-turn execution allowance |

```sh
npm run check
npm test
npm run demo -- "Explain why the sky turns red in 30 seconds"
```

The demo requires a running server and makes paid API requests. Logs: `.data/trueforge.log` and `.data/projects/<id>/render.log`. A stopped local render is marked failed on restart. [Architecture](docs/architecture.md) · [Original brief](Instructions.md) · [Hackathon challenge](hackathon-challenge.md).

## License

Original code: **[MIT](LICENSE)**. Dependencies and imported media retain their own licenses. TrueForge is MIT; HyperFrames is Apache-2.0; GSAP has its own license. Remotion is not installed. Credits record provenance; attribution alone does not establish permission to reuse a clip.
