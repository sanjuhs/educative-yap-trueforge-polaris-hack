# Hosted demo verification — September 26, 2026

Live studio: https://educative-yap.vercel.app

Backend release: `91306f840ed12a4ba0cf60ff0d2da80c6be9475a`. The matching GitHub image workflow succeeded. The Vercel studio proxies authenticated requests to the dedicated Yap backend; generated code runs in the separate Modal renderer.

## End-to-end generation

The production test signed in, uploaded a PNG, submitted an Astra/high brief, waited for the TrueForge director and visual review, synthesized narration, rendered on Modal, and downloaded the encrypted-R2-backed MP4 through the authenticated application.

- Project: `80653e93-d1f2-41ea-9c52-f768cd6716c2` (owner login required).
- Output: 9.390666 seconds, 1080 × 1920, H.264 video and AAC audio, 691,895 bytes.
- Recorded approximate AI cost: $1.042274 across six model calls including two reviews, plus the included audio estimate. Compute, storage and network costs are excluded. This is one result, not a per-minute pricing guarantee.
- A real browser played the output to completion, then reloaded and retained the project. No JavaScript errors occurred.
- An additional 12,138,270-byte clip from the owner's HTML/CSS recording uploaded through Vercel, became a five-second library excerpt and returned HTTP 206 for a byte-range request.

## Persistence and access

After replacing the backend container, thirteen projects were present: twelve imported projects plus the new cloud generation. The historical Korean War MP4 downloaded in full (5,044,614 bytes) and played with audio at 2, 20 and 55 seconds. Source credits and its recorded cost ledger survived. The old project's ledger estimate covers its recorded turn; it differs from the README's whole-experiment cost including additional runs and checks.

Verified owner login, owner-created user, CSRF enforcement, signed-out denial, cross-user project/media denial, secure HttpOnly cookies, idempotent submission, immutable saved versions, range downloads, logout and fresh login.

The final local suite passed **36 tests with no skips**, using a real isolated PostgreSQL database. Type checking passed. Additional renderer probes verified blocked outbound networking, no injected credentials, selected-asset delivery and authenticated adapter access. The live Korean War artifact was originally generated locally and imported; the new nine-second artifact demonstrates the full hosted generation path.

## Recovery and current limits

Postgres holds accounts, ownership, projects, versions and jobs. R2 holds encrypted durable media. A named volume holds TrueForge session state and working files. Source and encrypted recovery archives are kept separately on GitHub; see [recovery](runtime-backup.md) and [hosting](hosting.md).

Older TrueForge traces remain in the encrypted pre-hosted archive; the import restores projects, assets, designs and usage ledgers, not the old live orchestrator sessions. New hosted traces persist in the cloud volume. Automated off-host database/volume backups have not been scheduled. Twenty-minute workloads have not been benchmarked, and generated narration subtitles still use approximate timing.

Current visual uploads support PNG/JPEG/WebP images and 3–30-second video clips. Clips become a short excerpt (five seconds by default); uploading a long recording as a presenter is a separate flow. Asset selection guides the director; it does not guarantee every selected item will appear in the final cut.
