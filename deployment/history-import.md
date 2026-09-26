# Bring local projects and source assets into the hosted studio

This operator migration preserves completed local videos, unfinished drafts, source image/clip/presenter metadata, source media, animation plans and AI usage records. It assigns the import to the bootstrapped owner; it does not expose other accounts' resources or replace existing hosted projects.

1. Finish bootstrapping the owner and obtain that account's UUID from the authenticated account response or database administration.
2. On the source laptop, keep the dedicated deployment settings in ignored `.data/hosting/hosted-secrets.json`. Run with local mode (`YAP_HOSTED` unset or false):

   ```sh
   npx tsx scripts/export-hosted-history.ts --owner <hosted-owner-uuid>
   ```

   The script reads only its own `.data/projects`, `.data/visual-assets`, `.data/video-clips`, `.data/presenters`, `.data/designs` and `.data/usage` directories. It normalizes no files and never copies Make My Reels data. Media and the manifest use the dedicated private storage prefix and application AES-GCM encryption. A checkpoint records successful uploads so an interrupted export can be retried without sending unchanged files again.

3. Set the emitted object key as backend `YAP_LEGACY_MANIFEST_KEY` and restart the standalone application. Startup invokes `importLegacyHistory()` after database/owner initialization and before restoring project/usage caches.
4. Confirm imported counts in the server log and verify several saved videos, credits, usage figures and reusable assets through the authenticated application.

The import validates owner UUID, owner email, object-key ownership, project ID collisions and cache filenames. A recorded migration marker makes database inserts idempotent. Existing cloud projects are never overwritten by the older snapshot. Unfinished local drafts become failed drafts with an explanation, ready for a new revision. Small usage/design caches are reconstructed after a server disk replacement; media and sources are fetched lazily from encrypted object storage.

The active hosted TrueForge database is independent. Original orchestration traces remain in the separately encrypted runtime backup; the migration does **not** replace hosted TrueForge state or replay old paid model calls. Historical token/cost figures remain in the imported usage ledger.
