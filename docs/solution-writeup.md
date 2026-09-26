# Yap: an AI director for educational explainers

**Problem.** Educators need to explain concepts without becoming motion designers. Yap turns topics, screenshots or teaching recordings into narrated, editable animated explanations.

**Reach and boundary.** The director searches owned assets, Wikimedia and optional YouTube excerpts; authors HTML/CSS/SVG/Canvas animation; and invokes preview, review and export tools. It stops at an MP4, captions, credits and editable source. Creators review facts and permissions; publishing, purchases and outreach are unavailable.

**TrueForge integration.** The pinned runtime executes model calls, session context and MCP dispatch. Yap configures model/reasoning profiles through the HTTP API, creates sessions, submits turns and reads events and usage. Owner-specific profiles connect signed MCP endpoints. A 20-iteration limit bounds the agent loop; requested visual repairs are instruction-based. Session and turn ownership checks protect access to traces.

**Execution and feedback.** `preview_design` renders frames, checks backward-seek determinism and returns a metered vision critique. The director revises source, then calls `render_design`. Workers handle narration, compositing and FFmpeg export; rendering and polling require no additional model calls. This separates creative decisions from repeatable media operations.

**Deployment.** Browser -> authenticated Yap API -> private TrueForge -> MCP tools -> rendering workers -> encrypted R2. Postgres stores ownership, history and durable jobs with idempotent submission and worker leases. Yap's Modal adapter executes generated code in disposable sandboxes without outbound networking or injected credentials. TrueForge's built-in sandbox, dynamic subagents and interactive approvals are unused.

**Evidence and limits.** A verified hosted run produced a playable 9.4-second video using real models, tools, narration, rendering and storage; no services were mocked. The longer Korean War example was generated locally, manually audited and imported. Recorded failures include a timeout requiring continuation, overlapping labels and missing narration repaired manually. Captions remain approximate; long videos are unbenchmarked. Estimates exclude infrastructure; iteration limits do not enforce a dollar budget.
