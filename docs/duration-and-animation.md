# Duration and animation support

The AI-voice slider accepts 5–1200 seconds in 5-second steps. `creativeBrief.targetDurationSeconds` is optional so existing projects remain readable. New UI requests include it; revisions restore it. Presenter mode disables this control and preserves the recording's duration. The presenter upload/transcription/cutout path retains its existing 3–60 second limit.

The brief supplies a target of roughly 2.1 narration words/second, a ±6 second tolerance, and chapter guidance for longer work. Schemas allow up to 160 scenes and adjust the narration word ceiling to the requested duration. Preview scenes are weighted by narration length and scaled to the requested target, rather than assuming six seconds per scene. Final timings always come from measured audio.

After synthesis, recordings within tolerance keep their natural tempo. Otherwise the system can fit to the target with pitch-preserving FFmpeg `atempo`, bounded to 0.85–1.18×. It never retimes uploaded presenter narration. A larger discrepancy fails before expensive frame rendering and asks for a script rewrite. This is a target with a bounded fit, not a guarantee that every generated script succeeds. No silent truncation or long frozen-frame padding is used.

Narration clips are normalized/padded sequentially and concatenated into one audio stream, so a long video does not open 160 audio inputs simultaneously. Original TTS duration is retained for the audio cost estimate. Frame-render timeout scales with actual duration (at least 15 minutes, six seconds of wall time per second of video). Rendering remains local and sequential; complex scenes can take longer than playback and still hit a timeout. It does not have chapter-level restart checkpoints yet.

The duration budget shown before generation is a proportional extrapolation of the existing 30-second token scenarios. It is explicitly not a benchmark or spending cap. Actual returned tokens and estimated narration cost are shown with the project. Long context and repeated repair passes can make cost nonlinear.

## Animation skill

`skills/animate-explainers/SKILL.md` is loaded into the director profile at startup. Its optional reference analysis is exposed by `get_animation_reference`. It distills the user-supplied Vietnam animation project's scene-local timing, camera projection, layered motion, procedural assets, path tracing, event-based action and complete-scene crossfades. It does not import that project's assets, factual claims, soundtrack or fixed layouts. The separate Codex installation uses the same files.

## Validation limits

Tests cover range/step rejection, legacy plans, duration fitting, real FFmpeg audio concatenation and tempo correction, and a 100-scene 20-minute timeline including deterministic seeking at 1199 seconds. Browser checks cover persistence, submission, cost updates and presenter behavior. Full 20-minute model generation and all 36,000 exported frames have not been benchmarked; long-video cost and creative quality remain workload-dependent.
