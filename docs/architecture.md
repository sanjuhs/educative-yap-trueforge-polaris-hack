# Working architecture

Implemented on 26 September 2026 for the localhost hackathon demo.

```text
Browser studio (8789)
  → TrueForge HTTP API (8790)
    → OpenAI director model
    → optional TrueForge dynamic subagents
    → local HTTP MCP tools (8789/mcp)
      → authored source → frame previews + Astra vision critique → revisions
      → narration/original voice → isolated Chromium → person matte → FFmpeg → MP4
```

TrueForge is installed as a pinned npm dependency. Its bundled UI remains
available for inspecting agent instructions, sessions, tool calls, and subagents.
`src/start.ts` starts a project-local instance with SQLite under `.data/` and
configures it through its public API. Restarting refreshes the configured key,
model, and agent manifest. The launcher permits loopback outbound requests so
TrueForge can reach the local MCP service.

`src/trueforge.ts` contains the director instructions and integration bootstrap.
`src/server.ts` serves the small studio, forwards chat turns to TrueForge, and
exposes preview_design, render_design, recording lookup, project lookup, status
and listing tools. TrueForge orchestrates the creative authoring loop. Because
its current MCP adapter omits image blocks, preview_design calls Astra vision
explicitly and returns a metered visual critique to the director.

`src/projects.ts` queues one render at a time and persists project manifests.
OpenAI generates a separate narration track for each scene. ffprobe measures its
length, and the scene timeline is derived from the actual audio. The renderer
gets a copy of the environment without API keys or tokens.

`src/authored.ts` accepts complete HTML/CSS/JavaScript. The isolated browser
validates frames and backward seeking before export. `src/cutout.ts` uses local
Apple Vision (macOS) or MediaPipe segmentation and composites the presenter over
the custom background. Captions are rendered above the presenter. FFmpeg encodes
the MP4, mixes optional music, and extracts a poster. The original controlled
HyperFrames renderer remains available for earlier saved projects. See
[freeform authoring](freeform-director.md) for boundaries and setup.

## State and iteration

Each project directory contains `project.json`, `storyboard.json`, `index.html`,
voice WAVs, renderer logs, a poster, and `video.mp4`. The studio stores its current
chat session in browser session storage so follow-ups use the same TrueForge
conversation. New renders get new IDs and preserve older versions. Interrupted
renders become failed on restart rather than silently appearing complete.

## Deliberate first-version limits

Text or presenter recordings are supported. Presenter uploads are inspected with
ffprobe, transcribed with word timestamps, and stored under `.data/presenters/`.
TrueForge chooses scene start times against the transcript. Presenter mode keeps
the source audio and never calls TTS. Generated visuals are bounded browser code,
with no external network or local API access. There is no live research or asset
search connector. Preview review covers selected frames, not every possible
frame, and automatic cutout edges can need refinement. There is no cloud
deployment or multi-user authentication in this version.

## Next increments

1. Tune one specific educational series: pacing, typography, examples, and diagrams.
2. Add transcript corrections, manual audio offsets, and clip trimming.
3. Add richer visual templates and editable storyboard controls.
4. Add an optional isolated code-generation renderer and Remotion/Manim adapters.
5. Containerize the worker; use TrueForge hosted mode with authentication,
   Postgres/Redis, and object storage for shared deployments.

## Upstream references

- [TrueForge](https://github.com/truefoundry/trueforge)
- [TrueForge quickstart and hosted mode](https://trueforge.dev/quickstart)
- [TrueForge MCP configuration](https://trueforge.dev/mcp-servers)
- [HyperFrames](https://github.com/heygen-com/hyperframes)
- [OpenAI speech API](https://developers.openai.com/api/docs/guides/text-to-speech)
