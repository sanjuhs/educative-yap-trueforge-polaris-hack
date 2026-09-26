# Korean War, one-minute experiment

Run date: 2026-09-26. Director and image reviewer: GPT-6 Astra, high reasoning.

The brief requested 60 seconds (±6 seconds), host subtitles, original animated maps, minimal labels, and relevant archival assets. The director wrote 124 words across eight historical beats. It imported two photographs and a four-second National Archives YouTube excerpt, with source metadata retained.

The experiment exposed a real execution limit: TrueForge defaults to 600 seconds per agent turn. Sourcing, full-source generation and visual revisions exceeded that limit before export. A continuation reused the session, saved design and imported assets. The app now defaults `SERVER_EXECUTION_TIMEOUT_SECONDS` to 1800 when starting TrueForge; an explicitly configured environment value takes precedence. This is an execution allowance, not a promise that long videos finish within it or a replacement for resumable jobs.

Visual review caught map/legend overlap, a mismatch between territory fills and the demarcation line, and a background covering headings. These were corrected before the accepted preview. The footage reviewer correctly identified that a clip titled about ceasefire talks showed a military vehicle, so it was used as general wartime context instead of as signing footage.

Current limits worth addressing next:

- Preview review samples three times, which cannot cover every beat or prove smooth motion. Review the completed video and sample every scene and transition.
- The director resubmits full source for a small visual repair. A bounded patch tool could reduce generated tokens and turnaround time; savings have not been benchmarked.
- Generated narration captions use even time allocation within each scene rather than measured word timestamps. Assess against the audio before claiming precise alignment.
- The project cost panel attributes the turn that created the project. An interrupted earlier turn still costs money. Add those earlier runs when reporting total experiment cost.
- Narration requests run sequentially and can retry on slow responses. This can dominate latency even after direction is finished.
- A retrieved clip's channel is its uploader, not verified proof of ownership or permission. Pending rights status is preserved with credits.

Historical sources: [Office of the Historian](https://history.state.gov/milestones/1945-1952/korean-war) and the [National Archives armistice document](https://www.archives.gov/milestone-documents/armistice-agreement-restoration-south-korean-state). The narration distinguishes an armistice from a peace treaty and the original 38th parallel from the later military demarcation line. Maps are explicitly schematic and fronts approximate.

## Measured outcome

The finished, audited export is 60.17 seconds, 1080×1920 at 30fps, with H.264 video and AAC narration. All eight beats, 16 interior scene samples, 14 boundary samples and the final frame were inspected. Backward seeking reproduced identical pixels, and the MP4 decoded without errors.

The post-export audio check caught a missing TTS phrase (“rival governments emerged”) that still appeared in the original even-spaced captions. A second transcription of that segment confirmed the omission. The segment was regenerated and checked, while the other seven audio files were reused. For this experiment, caption timing was rebuilt from Whisper word timestamps and matched to scene text; a final boundary check prevented a slightly early ASR timestamp from assigning “But” to the preceding scene. These artifact repairs are not yet automatic pipeline behavior.

Recorded direction/review usage across both turns: 260,763 input tokens (197,045 cache-read; 63,228 cache-write) and 37,989 output tokens, including 13,927 reasoning tokens. Fourteen recorded model calls included five visual reviews. Direction and reviews cost approximately $2.8917; original and replacement narration approximately $0.0166; audio transcription checks approximately $0.0078. **Full experiment estimate: $2.9162**, excluding local compute, licensing, unreported interrupted/failed usage and account-specific discounts. The final project panel alone understates this experiment because it excludes the earlier interrupted turn.

The animation is a functioning, restrained map-led documentary. It is not yet a polished editorial benchmark: composition variety, higher-resolution footage, automatic audio-faithfulness checks, resume support and cumulative cost accounting still need work. No claim is made that this validates 20-minute generation or demonstrates TrueFoundry-specific token savings.
