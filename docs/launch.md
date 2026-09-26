# Yap launch kit

Prepared September 26, 2026. Current release: open-source studio with an invite-only hosted preview. Custom domain and Product Hunt are next launch targets. Hosted per-user BYOK and paid subscriptions are planned.

## Product Hunt draft

**Name:** Yap

**Tagline:** Big ideas. Little videos. An AI director that makes the edit.

**Description:** Turn an idea or your own teaching recording into an animated explainer. Yap's TrueForge director finds visuals, writes original animation code, inspects previews and revises the result. Get narration, captions, source credits, editable projects and visible AI cost estimates. Open source; hosted preview is invite-only.

**Maker comment draft:**

> I built Yap because explaining an idea should not require becoming a motion designer. Give it a topic, a recording, or screenshots, and the director actually makes the video: it writes animation code, renders previews, inspects the frames and makes another pass when something is wrong. You can ask for a new cut and keep the earlier version.
>
> TrueForge runs the agent loop. Our README includes a real trace with rejected previews, revisions, a timeout and a continued session—not just the final export. We also show the recorded token usage and AI cost estimates.
>
> You can run Yap locally with your own OpenAI key today. The hosted studio is invite-only while we prepare per-user BYOK and a managed plan. I'd love feedback on the explanations, editing experience and cost transparency.

These are drafts for the maker to post. No Product Hunt submission or outreach has been sent.

## Three-minute judge walkthrough

Have the saved Korean War project and the verified hosted screenshot project ready in an owner account. Use existing results for a dependable short demo; a fresh generation makes paid API calls and has variable latency.

| Time      | Show                                                     | Say                                                                                                                                            |
| --------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:25 | The studio and a topic or screenshot brief               | “Yap hands the whole explainer-production job to an agent.”                                                                                    |
| 0:25–0:55 | Play a completed MP4                                     | “It produces a usable artifact, with narration, animation and captions.”                                                                       |
| 0:55–1:35 | [Recorded trace](traces/korean-war.md) and source        | “TrueForge calls the tools. Frame review catches problems and the director rewrites the animation.”                                            |
| 1:35–2:00 | **Revise this video**, saved source and earlier projects | “Feedback becomes another editable cut, with the earlier result preserved.”                                                                    |
| 2:00–2:30 | Project AI cost panel and whole-experiment calculation   | “Model work is metered; rendering and polling consume no model calls. Cache savings use an explicit same-token baseline.”                      |
| 2:30–3:00 | Hosted architecture and permission boundary              | “Jobs, history and encrypted media persist. Generated code runs in a separate sandbox. Sharing and external publishing stay with the creator.” |

Do not imply the demonstration includes an approval-gated publishing tool. It currently stops at an export the creator can review and share. Visual repairs are bounded by director instructions, not a hard budget enforcement mechanism.

## Commercial model to implement

Working interpretation of the proposed offer: **$20/month for Yap access, plus metered AI usage at published provider rates**. The $20 is a platform fee; it is not unlimited AI or a defined credit allowance. Included storage/render allowances, taxes and treatment of provider discounts need a final product decision before checkout copy is published.

| Path                     | Today                                                  | Next implementation                                                                                                                         |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Local / self-hosted BYOK | Server environment supplies the operator's key         | Keep setup simple and documented                                                                                                            |
| Hosted BYOK              | Not available; hosted credentials are operator-managed | Per-user encrypted keys, owner isolation, masked display, revoke/delete, per-job credential selection and no key exposure to generated code |
| Managed subscription     | No checkout or billing system                          | Subscription lifecycle, payment webhooks, entitlements, spend controls and metered usage                                                    |
| Cost visibility          | Per-turn model/token estimates plus audio allocation   | Cumulative project/revision ledger with rate snapshots and provider reconciliation                                                          |

For each future billable operation, retain an idempotent operation ID, account, project, revision, provider/model, service tier, token categories, audio units, timestamp, rate-card version and reconciliation status. Keep estimated, reported and reconciled amounts distinguishable. Unknown usage must not silently become zero. Retries and failed operations need explicit accounting, and webhook retries must never charge twice.

A receipt should separate the $20 platform fee, AI usage, any separately disclosed infrastructure charges and applicable taxes. Show cache reads/writes and reasoning without double-counting their parent token categories. Link the applicable [official provider rates](https://developers.openai.com/api/docs/pricing). Existing TTS duration estimates and per-turn totals are useful feedback but are not sufficient for invoice-grade billing.

## Next launch steps

- [x] Public GitHub repository linked to the hosted studio.
- [x] Vercel production builds connected to pushes on `main`.
- [x] Original Yap logo used in the README and studio.
- [x] Real trace, measured examples and limitation disclosures available to judges.
- [ ] Choose and buy the custom domain; attach it to Vercel, verify DNS/HTTPS and update `PUBLIC_APP_URL`, sharing metadata and documentation together.
- [ ] Choose the Product Hunt launch URL and access policy; keep invite-only wording until self-service signup exists.
- [ ] Prepare a short product walkthrough and screenshots using non-personal demo inputs.
- [ ] Rehearse playback, a revision and the cost explanation in the hosted account.
- [ ] Schedule and verify off-host backups before expanding hosted access.
- [ ] Implement and verify per-user BYOK before advertising it as available.
- [ ] Finalize allowances, then implement billing and receipts before accepting subscriptions.

[Hosting and recovery](../deployment/hosting.md) · [Verified hosted demo](../deployment/demo-verification.md) · [Cost assumptions](model-costs.md)
