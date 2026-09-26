# Proposed architecture

Recommendation researched on 26 September 2026. This document describes the
build plan, not implemented features.

## Decision

Use TrueForge for the agent loop and initial chat interface, and build a small
TypeScript video tool service around HyperFrames and FFmpeg. Keep TrueForge as
an upstream dependency instead of forking its entire application. A fork is
worth considering only if a concrete integration limitation blocks the demo.

TrueForge already supplies sessions, streaming, model integration, MCP tools,
and local SQLite storage. Its local mode needs no Postgres or Redis. Model API
access is separately configured; the npx command does not supply free GPT usage.
Sources: [TrueForge](https://github.com/truefoundry/trueforge) and
[quickstart](https://trueforge.dev/quickstart).

The documented sandbox for arbitrary code and skill execution currently uses
Daytona. For local rendering, expose our own bounded video operations through
an HTTP MCP server running on the same machine. Do not assume that installing
TrueForge gives the agent access to the local shell. Keep core editing guidance
in the agent instructions initially; a sandbox-backed skill workflow can follow.
Sources: [sandbox](https://trueforge.dev/sandbox) and
[MCP setup](https://trueforge.dev/mcp-servers).

## Rendering choice

HyperFrames is the default recommendation because editable HTML/CSS/SVG scenes
match the brief and its Apache-2.0 license suits broad open-source reuse. It
offers browser preview and deterministic frame capture with Chrome and FFmpeg.
Source: [HyperFrames](https://github.com/heygen-com/hyperframes).

Remotion remains a useful optional backend for React-based compositions. Its
license is source-available rather than OSI open source; free eligibility and
company licensing apply separately from this project's MIT license. Keep it
optional so users can choose the renderer that fits their circumstances.
Source: [Remotion license FAQ](https://www.remotion.dev/docs/license/faq).

Use one renderer for the first complete demo. Add Manim only when a particular
mathematical explanation needs it. Python 3.12 can power that optional worker
later; a separate Python API adds little to the initial Node-based integration.

## User workflow

1. Provide a topic, a recorded explanation, and optional supporting assets.
2. Inspect the recording and transcribe it if necessary. Preserve the user's
   voice as the default narration; offer generated narration as an option.
3. Produce a short script and timed storyboard: hook, explanation, takeaway.
4. Generate or fill editable visual scenes aligned to the narration.
5. Render a low-resolution preview and let the user request changes in chat.
6. Export a vertical MP4 and retain the project for future edits.

Default target: 30 seconds, configurable to at most 60 seconds, 9:16, 30 fps.
Keep rendering local; model inference and optional transcription/TTS may use
external providers. Offer local provider adapters later if offline use matters.

## Video tool service

Expose a focused set of operations: inspect media, transcribe, save storyboard,
create/update composition, render preview, export MP4, and query job status.
Validate inputs with Zod and pass typed results back to TrueForge. Have the
renderer return a job ID immediately so a long render does not block an MCP
request. Start with one render at a time and persist job state for recovery.

Use a versioned project manifest containing aspect ratio, frame rate, duration,
asset IDs, narration timings, caption segments, scenes, and audio levels. Store
assets and output files in a project directory, referenced by ID. Keep business
logic outside TrueForge so the worker can also support a CLI or another agent.

The first release should use controlled templates and validated scene data.
Run generated executable compositions in a constrained worker before supporting
arbitrary code. Limit file access to the project directory, set render timeouts,
and keep provider credentials out of the rendering browser.

Add ffprobe checks for output dimensions, duration, and audio. Capture sample
frames to spot clipped text or missing visuals. Render timings should follow
the audio; generated narration needs alignment/transcription before reliable
word-level captions. Use reusable scenes and low-resolution previews to keep
iteration quick; do not promise instant final renders before measuring them.

## Demo milestones

1. **First complete path:** topic + supplied narration → three animated scenes
   → playable 20–30 second MP4. Use TrueForge to invoke the rendering tools.
2. **Recording workflow:** accept a talking-head clip, transcribe it, and retain
   the speaker while inserting visual explanations or overlays.
3. **Polish:** captions, transitions, music ducking, chat-based revisions, and a
   full-resolution vertical export.
4. **Packaging:** one startup command, dependency checks, an example project,
   documented provider setup, and a clean-machine smoke test.

Capture a short screen recording at each working milestone for the hackathon.
Prioritize the first complete path before building a custom timeline editor or
adding multiple render engines. Target a stable localhost demo before 3 pm and
reserve the final hour for presentation and recovery, per the original brief.

## Deployment after the local demo

Containerize the video worker with its browser, fonts, and FFmpeg. Run it on a
machine/container host suitable for long CPU-heavy jobs. Switch TrueForge to
its documented hosted mode with Postgres, Redis, and authentication; add object
storage for media. Local unauthenticated mode should stay on localhost.
Source: [TrueForge deployment options](https://trueforge.dev/quickstart).

The first integration spike must verify that TrueForge can discover the local
MCP endpoint, submit a render, poll it, and expose a playable artifact link.
Then pin working package versions and build the installer around that tested
path. Deployability is a planned outcome, not currently verified.
