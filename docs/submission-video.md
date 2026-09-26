# Submission video: 2 minutes 50 seconds

For a shorter website-focused take, use the [two-minute spoken script](demo-script-two-minutes.md), including 35 seconds of actual TrueForge UI/API footage and instructions for opening real hosted events.

Deliver a landscape 1920 x 1080 MP4 with narration and readable captions. Target 2:50, leaving ten seconds below the absolute 3:00 cap. Keep the portrait Yap output inside the landscape recording. A product export alone is not the required screen recording of the solution.

## Screen sequence and narration

| Time | Screen and action | Suggested narration |
| --- | --- | --- |
| 0:00-0:10 | Play an attractive section of a completed explainer inside Yap. Add a small Yap title. | "Teachers have ideas worth explaining, but producing an animated lesson takes scripting, sourcing, animation and editing. Yap gives that production workflow to an AI director." |
| 0:10-0:30 | Show the actual brief, selected input and model settings for the run you will inspect. | "Give it a topic, screenshot or teaching recording. Here is the brief for this run. The director plans the explanation and uses tools to create the video." |
| 0:30-1:15 | **45 seconds of actual TrueForge UI or API**, at readable speed. Show the matching agent configuration, session and expanded tool calls/results. | "This is TrueForge, which runs our director. The profile connects the model, instructions and Yap's MCP tools. Here is a real session: the director calls a preview tool, receives a critique of rendered frames, and uses that feedback before requesting a render. The worker then takes over. These events let us inspect what happened instead of trusting a completion message." |
| 1:15-1:40 | Return to the corresponding completed project. Play an excerpt with its own audio, then show captions and credits. | "This is the saved output from that run: narration, animation, captions and source credits." Pause your voiceover while the sample narration plays. |
| 1:40-2:00 | Show animation source and a previously completed revision alongside its original. If none is prepared, show the revision entry point only and identify it as such. | "The output includes editable animation. Feedback can become a new version while the original stays available." Only describe a completed revision if the recording shows one. |
| 2:00-2:20 | Show a simple architecture card: Studio -> Yap API -> TrueForge -> MCP tools -> Modal renderer -> encrypted R2. Add Postgres jobs/history below the API. | "TrueForge manages the agent loop. Yap supplies authenticated tools, job persistence and a separate renderer for generated code. The creator gets a downloadable project." |
| 2:20-2:40 | Show a concise limits card with a relevant real error or critique excerpt. | "The system uses real services. It stops before publishing. Creators review facts and media permissions. We have seen timeouts, visual defects and narration errors; some needed manual repair. Caption timing remains approximate." |
| 2:40-2:50 | Show the public GitHub README, root solution PDF and commit history. | "The repository is public under MIT, with setup instructions, an environment example, development history and a concise solution writeup." |

## Prepare the evidence before recording

- Pick one real session and its corresponding output for the central walkthrough. Pre-open the brief, TrueForge session, final project, source, credits and repository tabs. Narrate only tools and results actually visible in that session.
- The hosted studio does not expose the private TrueForge dashboard. For UI footage, use the local TrueForge interface at localhost:8790 with an existing local session. Alternatively, show actual authenticated hosted event responses in a readable API viewer without credentials. The documented application endpoint is `GET /api/turns/:session/:turn/events` and returns the first 100 events.
- The imported Korean War project does not have its original live session in the hosted orchestrator. Its sanitized trace is supporting evidence, not a substitute for the required actual UI/API segment. Use an available local session or a newer hosted session.
- Save a real generation recording before editing. If processing time is omitted, label the cut "Generation wait shortened"; if showing an existing result, label it "Previously completed run." Do not imply a full generation finishes within the three-minute recording.
- A fresh generation has variable latency and uses paid APIs. Do not depend on it completing while recording the final take. Prepare a completed revision if you want to demonstrate revision results.
- Keep the 45-second TrueForge segment in the exported timeline. A title card, architecture diagram, source file or logo alone is not the evidence segment.
- Close unrelated tabs and hide passwords, API keys, cookies and authorization headers. Increase browser zoom so session/tool text is readable at 1080p. Record only non-personal demo inputs.

## Export and submission

Export MP4 with H.264 video and AAC audio at 1920 x 1080, ideally 30 fps. Include voice narration or captions; using both helps reviewers. Keep transitions within the allocated times. Verify the final file's duration, dimensions, audio and complete playback after export.

Upload to Google Drive, set **Anyone with the link -> Viewer**, and verify playback in a signed-out/incognito window. Paste that file link in the form. Submit the repository-root `solution-writeup.pdf` link for artifact 02 and the public repository URL for artifact 03. Local documentation/PDF changes must be committed and pushed before those GitHub links work.

Optional technical verification:

```sh
ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,width,height -of json demo.mp4
```

The output must show total duration no greater than 180 seconds and a 1920 x 1080 video stream. Watch the export to confirm at least 30 seconds of readable TrueForge use survived editing.
