# Two-minute website walkthrough

Target 1:55-2:00. The spoken script is approximately 200 words; rehearse it with the screen changes. The TrueForge segment must remain visible for the full 35 seconds, even if you finish speaking early. The competition's overall hard cap remains 3:00.

## 0:00-0:15 - Yap website and a finished video

"This is Yap, an AI director for educational videos. Teachers can explain an idea without manually scripting, animating and editing every scene. Here is an example of the finished result."

## 0:15-0:35 - Brief and selected inputs

"Start with a topic, screenshot or teaching recording, then choose duration and model settings. This is the brief for the run I'm showing. The director finds useful assets, writes animation code and checks rendered previews."

## 0:35-1:10 - Actual TrueForge UI or API response

"Behind this website, TrueForge runs the agent. This is the real session for this example. These events show the tools it called and the results it received. The preview tool returns feedback from rendered frames, so the director can revise its design before requesting export. TrueForge handles the model and tool loop; our workers handle media rendering."

Hold for 35 seconds. Open a preview call, show the returned critique, then a render request. If the chosen session did not revise, do not claim it did. Use a completed session if a fresh generation would take too long.

## 1:10-1:35 - Matching video, credits and editable source

"Back in Yap, this is the corresponding output, with narration, captions and source credits. The animation source stays editable. A revision can create another version while preserving the earlier result."

Let the output play for several seconds without speaking over its narration.

## 1:35-2:00 - Cost panel, boundaries and GitHub link

"The app shows recorded AI usage and estimated cost. Models, tools and rendering are real. It stops before publishing: creators review facts and media permissions. Captions and generated content can still need correction. The project is open source, with setup instructions and a technical writeup."

## Showing TrueForge while staying on the hosted website

The rules permit UI, SDK or API footage; the broader TrueFoundry dashboard is not required. Yap's "TRUEFORGE CONNECTED" badge is supporting context, not sufficient evidence by itself.

The website already has an authenticated proxy for real TrueForge events:

```text
/api/turns/<sessionId>/<turnId>/events
```

Prepare before recording:

1. Sign in to Yap and choose a recent hosted run. Open browser Developer Tools -> Network and inspect the run's requests. A request to `/api/turns/<sessionId>/<turnId>` identifies its session and turn. A job-status response can also contain `result.sessionId` and `result.turnId`.
2. In another tab on the same signed-in site, open `/api/turns/<sessionId>/<turnId>/events`, replacing both placeholders with the actual IDs. The route verifies ownership and forwards to TrueForge's turn-events API. It returns the first 100 events.
3. Use the browser's readable JSON view, or the Network panel's Preview/Response tab, to expand actual tool calls and results. Prepare a preview critique and render call. Confirm both belong to the output you plan to show. If the first page lacks those events, use the local TrueForge UI with a suitable session instead.
4. During 0:35-1:10, show this response with the caption "TrueForge API events via Yap's authenticated backend." Show response data only, not cookies or authorization headers. Then return to the project.

If no session is visible in Network, the current browser may no longer be polling that run. The app saves its recent run IDs in the site's Local Storage under `yap-active-run:<account-id>`; `completedTurnId` may replace `turnId` after completion. Inspect this one entry in Developer Tools -> Application/Storage to obtain the IDs. An imported historical project may have no accessible hosted session; use a newer hosted run instead.

For clearer UI footage, run Yap locally and open its **Open TrueForge** link at `http://127.0.0.1:8790`. Inspect an existing local session. Keep that session's matching output in the demo; do not imply it is the same as an unrelated hosted run. The private hosted dashboard need not be exposed.

No video has been recorded by preparing this script. Label previously completed runs and any omitted generation wait. Export landscape 1920 x 1080 MP4 with narration or captions, and verify at least 30 seconds of actual TrueForge use in the final edit.
