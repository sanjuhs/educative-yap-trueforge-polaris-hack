# Autonomous footage and creative direction

The studio now supports **YouTube B-roll: Auto**. Users supply a topic, not a source link. The TrueForge director searches public YouTube videos, chooses 3–5 second excerpts, inspects actual frames, and places suitable clips alongside original motion graphics. **Off** keeps footage out of that request. Internet-photo share applies to the non-footage portions; it remains a soft editorial target.

## Setup

Install Python 3.10+ (or uv), then run:

```sh
npm run setup:clips
npm start
```

The installer creates an ignored `.data/clip-tools` environment using `requirements-clips.txt`. Node and FFmpeg are also required by the app. `YT_DLP_PATH` can point to an existing yt-dlp executable. The tools require no YouTube API key or browser login. YouTube availability and extraction can change; inaccessible streams produce an error and the agent is instructed to choose another public source or disclose a fallback, not repeatedly retry or ask for user links.

## Agent workflow

- `search_youtube_clips(query)` returns up to five video IDs with titles, channels, durations and source URLs. The agent plans the needed subject/action and supplies the query.
- `import_youtube_clip(videoId, startSeconds, durationSeconds, purpose)` imports a 3–5 second excerpt, normalizes it to a muted local MP4, decodes 30fps frames and asks the selected vision model to inspect three actual frames. The resulting critique, metadata and asset ID are returned to the director. Titles and channel names do not prove historical identity or rights ownership.
- The director includes selected IDs in `preview_design.clipAssetIds` and places each clip using `<img data-clip-id="ID" data-scene="0" data-offset="0">`. The host selects the exact decoded frame using the actual scene start and optional offset. The clip is hidden outside its duration or scene boundary. The model freely designs the surrounding HTML/CSS, wrappers, transitions, annotations and diagrams; it must not mutate the clip image's `src`.
- The normal preview, critique, repair and render loop follows. Repeated/backward seeks are verified to match, including footage. Source audio stays muted while narration continues.

The agent is instructed to use at most three excerpts for a short video by default, try at most two alternate sources after download failures, and avoid making specific historical claims from search keywords alone. These are editorial bounds; the import schema allows at most six declared assets and strictly limits each excerpt to five seconds.

## Credits and review

Every project using footage stores `clip-sources.json` and `credits.txt`. The result panel displays copyable footage credits containing the uploader/creator, channel name/link, video title/link, source timestamps, stated licence and intended visual purpose. The JSON record additionally includes retrieval time, local duration/dimensions and asset ID. All imported clips start with **permission pending**. No creator is contacted automatically, and preparing the draft does not pause for permission review. Credits do not imply permission; the uploader may not own every element in a video.

The app does not auto-publish. Permission/licence review happens before the user chooses how to distribute the result. It does not determine fair use or legal clearance. The acquisition tools do not use browser cookies, sign-in, DRM bypass or arbitrary agent-supplied URLs. Some sites or videos may not permit the intended acquisition or reuse; source terms and the intended use remain relevant.

## Isolation, costs and limits

The importer is a **bounded local subprocess**, not a Docker/VM security sandbox. It runs without API-key environment variables, ignores downloader configuration/plugins, accepts only validated YouTube IDs, caps downloads at 80 MB, applies timeouts and serializes imports. Generated animation executes separately in the existing isolated browser, with access only to declared local clip frames. Failed imports remove their own temporary directory.

Footage frame inspection uses the selected OpenAI model/effort and is included in the turn's measured review usage. Search/download/FFmpeg add no LLM tokens themselves, but tool results add director context. Local compute, storage, bandwidth and any licensing fees are outside the AI estimate. Failed API attempts without returned usage remain excluded as disclosed in the cost panel.

Creative controls also include pacing, explanation type, text density and visual notes. Scenes can be classified as `diagram`, `animation`, `photo`, `b-roll`, `screen-demo` or `mixed`. These are director-authored planning labels, not an automatic content verification system.

Future work: uploaded footage, licensed-stock adapters, better temporal inspection beyond three frames, scene-level source replacement, approval/permission records, on-screen attribution options and container isolation for hosted deployments. Automatic historical corroboration is not implemented.

References: [yt-dlp documentation](https://github.com/yt-dlp/yt-dlp), [YouTube terms](https://www.youtube.com/static?template=terms), [YouTube licence types](https://support.google.com/youtube/answer/2797468?hl=en), [YouTube fair-use guidance](https://support.google.com/youtube/answer/9783148?hl=en).
