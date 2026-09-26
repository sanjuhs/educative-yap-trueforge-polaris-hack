# Original animation and presenter cutouts

New generations use **GPT-6 Astra / high reasoning through TrueForge** to write the complete animation: HTML, CSS, SVG/Canvas, and JavaScript. The director is no longer offered a list of fixed visual templates. The older renderer remains only to read and reproduce existing projects.

The workflow is `preview_design → Astra vision critique of three frames → revise if needed → render_design`. TrueForge 0.2.1 drops MCP image content in this path, so the preview tool makes an explicit Astra vision call and returns its critique as text to the director. That call is metered alongside the orchestration calls. The source is stored with the storyboard, and the studio's **Revise this video** action points the director at that source. It can replace layout, palette, illustrations, transitions and animation logic. The model chooses a presenter rectangle to fit its design. Each revision creates a new project.

The authoring API is `window.renderFrame(time, duration, scenes)`. It must reconstruct the same frame for the same time even when seeking backwards. GSAP is provided locally; the director can instead draw into Canvas or animate SVG directly. The renderer supplies actual scene timings after narration generation. Preview timings for synthetic narration are estimates, whereas presenter previews use the recording's real timestamps. The preview is a small set of frames, not an exhaustive visual quality check.

Generated code runs in a separate headless Chromium context with an opaque sandbox origin, restrictive CSP, blocked service workers/WebSockets, and an allowlist containing only the generated document, local GSAP, the bundled café image, and explicitly declared imported images. Local APIs, arbitrary files and remote URLs are unavailable. Renderer subprocesses have time limits. Source HTML is served as a download with scripts disabled rather than executed on the studio origin. This is browser isolation for the local prototype, not a substitute for a hardened multi-tenant execution service.

## Presenter modes

- **Cutout**: Apple Vision's accurate person segmentation is preferred on macOS with a Swift toolchain. Google's MediaPipe Selfie Multiclass is the portable fallback. Both run locally; FFmpeg places the extracted presenter over the original animation. No green screen is required. Captions are added above the presenter layer.
- **Split screen**: retains the source background and places the original presenter video below the authored visuals.

The cutout mask is cached per immutable uploaded recording. Revisions reuse it without another segmentation pass. Apple Vision uses the native system framework and compiles the included Swift helper once. The MediaPipe fallback downloads a pinned, SHA-256-verified model (about 16 MB) from Google's model storage. Set `CUTOUT_BACKEND=auto|vision|mediapipe` to choose; `vision` fails clearly if unavailable, while `auto` can fall back to MediaPipe. The selected backend is recorded beside the cached mask. Segmentation uses a 15-fps mask and preserves the original voice; output is 30 fps. Masks are approximate: lighting, fine hair, fast hand movement and background objects can affect edges. This first version does not perform studio-quality temporal matting.

The full source video and rendered files stay in ignored `.data/`. Transcription sends audio to OpenAI. Vision critique sends selected preview stills; final-composite reviews can include the presenter. The sample’s final review sent three composite stills to Astra. Background removal and video rendering add no billable language-model tokens. Preview inspection and source revisions do consume Astra tokens and appear in the generation turn's cost report. The director can explicitly search Wikimedia Commons with search_web_images and import a selected image with import_web_image. No paid image/video generation is configured.

## Setup

```sh
npm install
npx playwright install chromium
npm start
```

FFmpeg must include `zscale`, `tonemap`, and `subtitles`/libass. The Homebrew FFmpeg used during development includes these. Install Chromium system dependencies as needed on Linux with `npx playwright install --with-deps chromium`.

Implementation references: [MediaPipe image segmentation](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/web_js), [Google's six-class model](https://developers.google.com/codelabs/litert-image-segmentation-cpp), [Playwright browser contexts](https://playwright.dev/docs/api/class-browsercontext). MediaPipe package licensing is Apache-2.0; model and browser dependencies retain their upstream terms.

The first freeform sample was authored and repaired by Astra through TrueForge, then its final composite received a separately recorded Astra vision review. That final review is included in its displayed cost.
