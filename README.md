# Educative Yap

A planned open-source video agent that turns a topic, your recorded explanation,
and optional assets into a short educational video ready to share.

Built for the TrueForge hackathon at Polaris School of Technology.

**Status: project brief and architecture only. The video application is not
implemented yet.** This repository was initialized from scratch on 26 September
2026. The original brief is preserved in [Instructions.md](Instructions.md).

## First demo

- Input: a topic or a 20–60 second recording, plus optional images and references.
- Agent: plan the story, select visuals, assemble scenes, and revise from feedback.
- Output: a vertical 1080 × 1920 MP4 with visuals and narration; captions and
  background music follow as the core render path stabilizes.
- Run locally first. Keep project files and editable scene sources on disk.

## Recommended stack

| Layer | Recommendation |
| --- | --- |
| Agent runtime and initial chat UI | TrueForge, used as an upstream dependency |
| Application and video tools | TypeScript on Node.js 22.14+ |
| Local tool interface | A purpose-built MCP server over HTTP |
| Default video renderer | HyperFrames: HTML, CSS, SVG, seekable animations |
| Media processing | FFmpeg and ffprobe |
| State and artifacts | TrueForge's SQLite plus per-project local directories |
| Later custom interface | React + Vite, using the TrueForge SDK |
| Optional renderers | Remotion for React compositions; Manim for specialized math |

See [docs/architecture.md](docs/architecture.md) for the proposed pipeline,
tradeoffs, deployment path, and demo milestones.

## Try the upstream agent harness

This starts **TrueForge only**, not the proposed video workflow. Requires
Node.js 22.14 or newer:

```sh
npx @truefoundry/trueforge@latest
```

Open http://localhost:8790 and configure a model provider in Settings → Models.
Model access requires your own credentials or a compatible endpoint. The local
interface does not mean that model inference runs offline.

Optional process configuration is documented in [.env.example](.env.example).
[example.env](example.env) is also supplied for the hackathon's requested naming.
Neither file is automatically loaded by this repository at this stage.

The eventual application should offer one startup command after prerequisites
are installed, with pinned dependency versions and a readiness check for FFmpeg
and the browser renderer. That launcher is still to be built.

## License

Original project code and documentation are under the [MIT License](LICENSE).
Third-party dependencies retain their own licenses. TrueForge is MIT;
HyperFrames is Apache-2.0. Remotion, if added, has its own source-available
license and eligibility requirements.
