# Educative Yap

Turn a topic into a short, narrated educational video on your computer.
Built for the TrueForge hackathon at Polaris School of Technology.

**Working first version:** a local studio, a configured TrueForge agent, and a
HyperFrames rendering worker. Give it a topic, watch the render progress, then
play or download a 1080 × 1920 MP4. Follow up in the same chat to make a new version.

## Run locally

Requires **Node.js 22.14+**, **FFmpeg**, and an **OpenAI API key** with API billing.
On macOS, install FFmpeg with `brew install ffmpeg`; on Ubuntu, use
`sudo apt install ffmpeg`. Windows users can install FFmpeg and add it to PATH.

```sh
npm ci
cp example.env .env
# Edit .env: replace sk-your-key-here with your real OpenAI API key.
npm start
```

Open **http://127.0.0.1:8789** for the studio or **http://127.0.0.1:8790** for
TrueForge's full agent interface. The launcher starts both services, connects the
OpenAI provider, registers the video MCP tools, and creates the `educative-yap`
agent. It uses a separate project-local TrueForge database.

HyperFrames downloads its rendering browser on the first render. To do that
before your demo, run `npx hyperframes browser ensure`. Rendering is local;
planning and AI voice generation use your OpenAI account and incur API usage.
The studio uses Google Fonts, with system-font fallbacks; rendered videos use
local system fonts and bundled GSAP, without external asset requests.

## Try it

> Explain why the sky turns red at sunset, with a vivid analogy, in 30 seconds.

Then follow up:

> Make that more playful and shorten it to 20 seconds. Keep the sunset comparison.

The agent reads the existing storyboard and creates a new render, preserving the
original. TrueForge dynamic subagents are enabled; the director uses them when a
complex request benefits from separate critique or research reasoning. Simple
videos generally use one agent. No separate cloud sandbox is required for our
video tools.

## What works

- Topic → script and storyboard via the real TrueForge agent loop.
- Five visual templates: orbit diagrams, comparisons, steps, bars, and statements.
- OpenAI narration, phrase captions, transitions, and an original synthesized music bed.
- One-at-a-time render queue, persistent project history, progress, playback, and download.
- Chat revisions; each version keeps its editable HTML, storyboard, and audio on disk.
- Export checks for vertical dimensions and an audio stream.

Captions use approximate phrase timing. This first version accepts **text topics
and pasted context**; recording uploads, transcription, precise word alignment,
custom generated scene code, and Remotion/Manim adapters are future iterations.
Visuals use controlled templates, so this is a starting point for creative
iteration rather than a full timeline editor. Outputs are limited to 60 seconds.

## Configuration

Both `example.env` and `.env.example` contain placeholders only. `.env`, local
TrueForge credentials, generated media, and logs are excluded from Git.

| Variable           | Default           | Purpose                                 |
| ------------------ | ----------------- | --------------------------------------- |
| `OPENAI_API_KEY`   | required          | TrueForge planning and voice generation |
| `OPENAI_MODEL`     | `gpt-5.4`         | Director model; must support tool calls |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | Narration model                         |
| `STUDIO_PORT`      | `8789`            | Studio and local MCP endpoint           |
| `PORT`             | `8790`            | TrueForge interface and API             |

Restart after changing configuration. The launcher updates this project's
provider key, model, agent instructions, and MCP endpoint automatically. Both
services bind to `127.0.0.1`. Keep this personal-use setup on localhost.

## Development and troubleshooting

```sh
npm run check
npm test
npm run format:check
npm run demo -- "Explain how a neural network learns in 25 seconds"
```

`npm run demo` requires the app to be running and makes a real paid model/voice
request. Find logs in `.data/trueforge.log` and
`.data/projects/<id>/render.log`. A stopped render is marked failed on restart;
ask the agent to create another version to retry. Ctrl+C stops the app and its
TrueForge child process; stop after active renders finish.

The source is in `src/`, the browser UI in `public/`, and a generated sample
storyboard in `examples/sunset.json`. The original brief is preserved in
[Instructions.md](Instructions.md). See [architecture](docs/architecture.md)
for integration details and the deployment path.

## License

Original code: [MIT](LICENSE). Dependencies retain their own licenses:
[TrueForge](https://github.com/truefoundry/trueforge) is MIT,
[HyperFrames](https://github.com/heygen-com/hyperframes) is Apache-2.0, and GSAP
has its own license. Remotion is not installed in this first version.
