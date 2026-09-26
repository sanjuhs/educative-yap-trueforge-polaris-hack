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

## Roadmap: open-source sharing first, public community next

The current application is a single-user localhost studio. It has no accounts,
global share links, uploads to a shared service, collaboration, or public feed.
The architecture below is a product direction, not an implemented deployment.

### Phase 1 · Open-source creator studio + global review links

Keep the creator's project and render local by default. Add an explicit
“Share a finished video” action that uploads only the selected render and
creator-approved title/description to a reachable share service. Return a
stable page URL backed by a random access token that can expire or be revoked.
The service should provide playback, versioned replacements, and time-coded
comments. Start collaboration with viewer/commenter links and versioned forks;
add named editor invites only after ownership and conflict rules are clear.

Suggested service boundary:

```text
Local open-source studio + renderer
  → authenticated share API (project owner, visibility, token, version)
    → SQL metadata store (projects, versions, permissions, comments)
    → private object storage (explicitly shared video only)
      → signed playback URL on the share page
```

Keep uploaded source footage, voice tracks, transcripts, and editable project
files local unless a creator separately selects them. Never expose provider
keys to the browser or put media in the Git repository. A self-hostable API and
storage adapter keep the project open source; an optional hosted service makes
links globally reachable without requiring every collaborator to deploy it.

### Phase 2 · Public teaching community

Add a public catalog only after link sharing is reliable. A separate Public
publish action adds selected metadata and the finished video to Discover; it
does not change the access scope of private drafts or review links. Build
profiles, topic search, follows, reporting/takedown, and opt-in remix rights on
top of the catalog. Keep public catalog queries separate from private project
and comment access checks.

### Creator workflow improvements

1. Tune one educational series: pacing, typography, examples, and diagrams.
2. Add transcript corrections, manual audio offsets, and clip trimming.
3. Add richer visual templates and editable storyboard controls.
4. Add an optional isolated code-generation renderer and Remotion/Manim adapters.
5. Containerize the worker and add remote rendering only if local rendering
   becomes a bottleneck; sharing a finished render does not require it.

## Upstream references

- [TrueForge](https://github.com/truefoundry/trueforge)
- [TrueForge quickstart and hosted mode](https://trueforge.dev/quickstart)
- [TrueForge MCP configuration](https://trueforge.dev/mcp-servers)
- [HyperFrames](https://github.com/heygen-com/hyperframes)
- [OpenAI speech API](https://developers.openai.com/api/docs/guides/text-to-speech)
