# Visual direction and moving footage

## Available now

The studio sends a validated creative brief with every request: desired internet-photo screen-time share (0–100%), explanation type, pacing, text density and freeform visual notes. These are instructions to the director, not measured quotas or fixed templates. At zero, the director is instructed not to search/import photos. At other settings it should prefer relevant assets over filling a quota. Existing model and reasoning controls continue to apply.

The director can record this brief in the storyboard and classify scenes as `diagram`, `animation`, `photo`, `screen-demo` or `mixed`. The studio displays these classifications and each scene's teaching purpose under **Shot plan & visual types**. Labels are authored planning metadata, not automatic verification of what appears on screen. Older projects retain their existing plans.

The web-image integration in the working prototype searches/imports Wikimedia Commons still images. **Moving B-roll import, stock-video search and YouTube clip acquisition are not implemented.** A moving-photo effect is not footage.

## Build the editor around shots

1. Align the transcript to narration timestamps. For each beat, state what the viewer should understand and choose a medium: explanatory animation, real-world B-roll, interface walkthrough, map/chart, or a contextual evidence excerpt.
2. Search for the required subject and action, not just the topic. Stock footage can illustrate a general concept; footage presented as a specific event must match its identity, date and location.
3. Inspect candidate contact sheets. Keep the source page, creator, license, retrieval date, source duration and classification with each candidate. Relevant motion matters more than arbitrary cutting speed.
4. Select source in/out points and timeline placement. Start with 2–5 second inserts as an editorial heuristic, adjusted for the narration and the shot's purpose. These durations are not copyright exemptions.
5. Combine footage with freely authored graphics: tracking labels, annotations, diagrams, split screens, close-ups and presenter cutouts. Keep source audio muted by default; deliberately select audio when it is evidence or needed context.
6. Render and review both representative frames and transitions. Verify the right excerpt, legible overlays, audio continuity and source attribution.

An initial clip record should include `assetId`, `sourceUrl`, `creator`, `license`, `rightsBasis`, `inSeconds`, `outSeconds`, `timelineStart`, `purpose`, `crop`, `layout` and `audioMode`. Source metadata is evidence about origin and stated terms, not an automatic legal clearance decision.

## Next implementation slice

Start with user-supplied clips and a Pexels adapter. Add `search_video_clips`, `inspect_clip` (contact sheet + metadata) and `import_clip_segment`, with bounded downloads and durations. A provider adapter should resolve canonical download URLs; the agent should not fetch arbitrary URLs into the renderer. Pexels requires an API key and attribution in API integrations. Pixabay is another API source. Neither is a general source of exact news-event footage.

Normalize imports to local MP4, then either decode frames at exact source timestamps or composite trimmed segments with FFmpeg. The current export seeks a browser frame by frame, so ordinary `<video autoplay>` would drift or freeze. A browser video path must pause every element, set `currentTime`, wait for the decoded frame, and pass the same backward-seek checks as animations. Predecoded image sequences offer simpler determinism at a storage cost. Keep source audio separate from visuals and retain narration as the timeline clock.

Expose a B-roll share control only after that path works. A three-way mix could then allocate footage, photographs and original graphics, with presenter visibility controlled separately. The editor should report achieved screen time, substitutions and unavailable assets. Do not add a nonfunctional B-roll slider to the current UI.

## YouTube excerpts

Treat YouTube URLs as references first. Reusable sources include material the user owns or has permission to use and appropriately licensed material (for example, CC BY with its attribution conditions). Standard YouTube licensing does not grant general reuse rights. Fair use/fair dealing depends on the jurisdiction and specific use; there is no universal safe number of seconds, and credit alone is insufficient. Obtaining a file is a separate issue from copyright permission: YouTube's terms restrict downloading except where authorized by the service or relevant permissions. Prefer creator-provided originals or authorized downloads rather than building an indiscriminate downloader.

Official sources, checked September 26, 2026:

- [Pexels video API and attribution guidelines](https://www.pexels.com/api/documentation/)
- [Pixabay video API](https://pixabay.com/api/docs/)
- [YouTube license types](https://support.google.com/youtube/answer/2797468?hl=en)
- [YouTube fair-use guidance](https://support.google.com/youtube/answer/9783148?hl=en)
- [YouTube terms](https://www.youtube.com/static?template=terms)
