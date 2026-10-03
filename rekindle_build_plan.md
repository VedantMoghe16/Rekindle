# Rekindle implementation plan

Planning date: 3 October 2026. Status: execution in progress. M0–M2, the offline sample path from M3, and discovery milestone D0 are implemented. The product direction now includes conversational account discovery; see [rekindle_discovery_expansion.md](./rekindle_discovery_expansion.md).

The product source of truth is [rekindle_product_spec.md](./rekindle_product_spec.md). This plan follows its M0–M8 order and records the decisions needed to make that sequence executable. Proposed clarifications below do not silently amend the spec.

## 1. Delivery target

Build the single-workspace hackathon product around this complete flow:

**Capture conversation → verified Revenue Memory → relevant signal → ranked action → editable draft → objection campaign → simulated engagement → revived deal.**

The first reviewable product is M2: Today, Accounts and Account Brain working on seeded data. The complete P0 release is M7: all five core demo scenes work after reset, with offline fallbacks. Revenue Loop is P1, so the initial presentation closes on the campaign-to-sales loop.

Keep authentication, CRM sync, real message delivery, real advertising and billing outside this build, as specified in §5.4.

## 2. Starting point and assumptions

- The workspace contains only the spec. There is no application, package manifest, Git repository, logo or design-system file.
- Local tools found: Node 22.22.0 and npm 10.9.4. Check compatibility with the selected dependencies during M0.
- Default delivery is a local Node application with persistent SQLite files, presented from this laptop. Hosting needs a separate deployment decision if requested later.
- Freeze demo business time at `DEMO_TODAY=2026-10-04`, displaying dates in Asia/Kolkata.
- Use the supplied fictional seller, contacts, accounts and conversations. A real careers board can coexist with a clearly fictional buyer conversation.
- Start with the spec's ember/amber/slate defaults and a temporary Rekindle wordmark. Replace these when brand assets are available.
- Provider credentials enable real LLM generation; seeded extraction and content fallbacks keep the known demo usable without credentials. New arbitrary conversations cannot claim successful AI extraction when neither a provider nor a matching cache entry exists.

## 3. Decisions to settle before their affected milestone

| Issue | Evidence in the spec | Proposed resolution |
|---|---|---|
| Watching count | 20 total, 5 Revive, 3 Warm; §6.1 says 14 Watching | Compute all counters. Initial state is **12 Watching**. |
| Exact hero score | Finvara's fallback match is 95; highest-value percentile is 100 | Under the usual percentile convention, priority rounds to **97**, rather than the illustrative 96. Specify percentile ties and rounding; display the calculated result. |
| Guaranteed demo lanes versus LLM variability | `0.6 × 95 + 0.4 × 20 = 65` for a neutral verdict; §12.2 promises stable lanes regardless of verdict | Keep §7.5 formulas. Assert baseline lanes in rules-only mode and against a reviewed, frozen demo verification cache. A fresh neutral verdict may legitimately change a lane. Seed tweaks cannot guarantee all possible verdicts. |
| Capture save boundary | §6.4 shows review before “Looks right”; §10 capture API saves immediately | Generate a preview without persistence, then “Looks right” commits interaction and memory and triggers matching. Add a preview endpoint; retain `POST /api/capture` as the commit endpoint. |
| Capture editing priority | Capture has Edit at P0; persisted memory correction is P1 | Permit edits to the extraction preview at P0. Editing an already saved memory stays P1. |
| Capturing the same hero file again | Finvara is already seeded; the demo uploads it again | Fingerprint the account/channel/normalized content. Reuse an identical saved interaction on repeat capture; return its reviewed result without duplicating timeline entries. |
| Engagements versus people | Scoring counts events; UI says “3 people”; schema has no anonymous person identifier | Say “3 engagements” using the existing schema. If distinct-person wording is required, add anonymous actor IDs and explicitly simulate three distinct actors. Never equate repeated clicks with distinct people. |
| Campaign launch lane precedence | §10 says mark targets Warm; §6.5 limits this to Watch targets | Recompute lanes through the matcher. Launched campaigns promote Watch to Warm and preserve existing Revive deals. |
| Campaign promise | Seller proof is a median 14-day onboarding time; hero copy can read as a universal guarantee | Preserve the demo concept, but show the median qualifier in supporting copy. Asset validation must reject stronger guarantees than seller proof supports. |
| Progress and time budgets | LLM timeout is 45 seconds with retries; extraction target is under 15 seconds | Treat 15 seconds as the normal-path target, not a guarantee. Set an overall operation deadline and bounded retries; retain input on timeout. Progress reflects actual work, with 400ms minimum visibility for completed steps. |
| Package and model examples | “Latest stable” is combined with concrete Prisma/Zod/model examples | Pin a compatible dependency set and verify provider model IDs during M0/M3. Adapt configuration to installed versions rather than copying examples verbatim. |

The ₹ totals are consistent: the 20 deals sum to **₹218 L / ₹2.18 Cr**; the six implementation-effort deals sum to **₹62 L**. “₹2.2 Cr” is presentation rounding. The initial five Revive deals total **₹76 L**.

MediQuick and Bharat Freight signals are 95 and 106 days old at the frozen date. Their rules-only matches are 47.5 and 45 respectively, placing both in Warm. Do not accidentally change their freshness by substituting collection time for event time.

## 4. Architecture and shared contracts

Use Next.js App Router, TypeScript, Tailwind, shadcn/ui, Lucide, Recharts, Prisma/SQLite, Zod, the Anthropic SDK and Vitest as the spec requests. Add P1-only libraries when those features begin.

| Layer | Responsibility |
|---|---|
| Pages and shared components | Presentation, review/edit controls, input retention, loading and error states |
| Route handlers | Validate requests; call services; return the §10 response envelope |
| Services | Coordinate persistence, extraction, matching, campaign launch and reset |
| Pure engines | Evidence checks, relevance, scores, lanes, aggregations and template fallbacks |
| Adapters | Anthropic calls, job-board fetches, database access and caches |

Use Node runtime for database/provider routes. Keep secrets and database clients server-side. Initial server-rendered reads and browser API reads should use the same services. After a mutation, refresh affected Today, account and campaign data so their counts agree.

Before component implementation, define in `schemas.ts`:

- Stall, signal, lane, channel, provenance and status enums.
- Memory extraction, match verdict, draft and campaign outputs.
- Shared Brief, Account Brain, extraction preview and mutation payloads.
- Evidence source references and normalized-to-original text offsets for highlighting.
- Recommendation fingerprint and lane-change payloads.

Use the §9 data model as the baseline, with these implementation details:

- Store app state in `dev.db`; keep `LlmCache` and `SourceCache` in a separate `cache.db` that reset never deletes.
- Transactions encompass state changes and lane/outcome events. Make network/LLM calls before short write transactions.
- Use stable seed keys for fixture relationships; retain cuid defaults for newly created objects. Avoid placing regenerated database IDs in LLM prompts.
- Define `valueScore = 100 × count(values below this value) / (dealCount − 1)`, with 100 for a single deal. Ties share a score; rank ties by match score, then deal value, then stable account key.
- Round final match and priority scores as specified; compare thresholds consistently.
- Preserve sent, snoozed and dismissed state when matching the same memory/signal fingerprint again. A genuinely new eligible signal can create a new recommendation. “Mark as sent” is a manual record of an external action, not message delivery.
- Build cache keys from resolved model ID, canonical inputs, schema definition/version and prompt version. Keep unstable IDs and runtime timestamps out of prompts. Reset must not invalidate warmed content.
- Persist original interaction text, normalized text and evidence location. Verify quotes against actual source text; low-confidence extraction remains visibly flagged.
- Use one business clock across seeds, engines, engagement events and outcomes. Use real elapsed time for performance and timeout measurement.
- Stable signal dedupe keys prevent each refresh from creating another corroborating signal. The same cached source response must not count as new evidence or reawaken a dismissed recommendation.
- A leadership job vacancy must be described as an opening, not proof that a leader has joined. Keep the source's dates and provenance.

Use streamed progress for signal checks and simulated engagement. Generation can use ordinary request/response flows with clear pending states. Only actual persisted lane changes produce move-to-Revive toasts.

Current documentation reviewed for integration planning: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Prisma SQLite setup](https://docs.prisma.io/docs/v7/prisma-orm/quickstart/sqlite), [Claude model catalog](https://platform.claude.com/docs/en/models/overview), and [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). These support verifying versions and structured-output integration at implementation time; no dependency versions have been selected yet.

## 5. Execution backlog and milestone gates

Each milestone ends with `npm run build`, `npm test`, and a click-through of the currently implemented demo scenes. Record what passes and any remaining limitation. Complete these sequentially.

| Milestone | Work packages | Review gate |
|---|---|---|
| **M0 — Foundation** | Initialize Git and Next.js; pin dependencies; configure SQLite, tests and environment loading; create shared schemas, shell, routes, tokens, clock and INR formatting | Shell runs; secrets stay server-side; formatting/time tests pass; database migration and basic read succeed. P1 pages are clearly upcoming. |
| **M1 — Demo data** | Seller and 20 accounts/deals; all conversations and verified precomputed memories; signals; extraction file-hash manifest; campaign fallback; cache separation; reset orchestration | Reset yields exactly 20 seeded deals; ₹218 L total; implementation effort is 6/20 and ₹62 L; every evidence quote maps to its source; a second reset preserves caches. |
| **M2 — First usable product** | Computed signals; rule matrix, freshness, eligibility, bonus, percentile and lane engines; Brief and Account services/APIs; Today, Accounts and Account Brain; snooze/dismiss actions | Baseline lanes are **5 Revive / 3 Warm / 12 Watch**; Finvara ranks first; every recommendation has quote and signal evidence; repeat matching preserves statuses and avoids duplicate recommendations. |
| **M3 — Conversation intelligence** | Structured LLM wrapper and caches; parser; extraction prompt, schema validation and evidence verification; merge rules; Capture preview/review/commit; fast-model verification | Finvara upload previews Budget with an exact highlighted quote; save refreshes the account; known files work on empty-cache offline fallback; arbitrary offline input gets an honest retry path; repeated sample capture is idempotent. |
| **M4 — Real signal moment** | Greenhouse/Lever adapters; title filtering; timeout, source cache and dedupe; Add Account and board test; signal progress; lane toasts; `boards:check` | A verified board yields real role links with correct dates; cached fetch failure is marked Cached; fictional interaction stays Demo data; new relevant evidence re-ranks the deal using the actual score. |
| **M5 — Sales action** | Draft prompts/fallbacks; WhatsApp/email toggle; editable subject/body persistence; regenerate, copy and mark sent; Done today strip | Top-five drafts reference the actual conversation and signal; WhatsApp ≤70 words, email ≤120; one ask; email subject present; edited draft persists; sent action records one outcome without delivering a message. |
| **M6 — Marketing loop** | Objection aggregations/chart/quotes; campaign generation and asset validation; target snapshot; simulated launch; Demo Controls; engagement aggregation and re-match | Only six matching stalled accounts are targeted; launch warms Watch targets; Tripnest and Zestcart revive after three matching engagements, Edunova remains Warm after one; event replay does not duplicate the same demo run. |
| **M7 — Demo readiness** | Complete warm-up manifest; freeze reviewed verification/content cache; check reset/cache stability; offline rehearsal; performance checks; visual/error/accessibility pass; README and presenter script | Reset and run the complete P0 path twice offline with zero errors; live fetch uses prewarmed Cached fallback; verify 1440×900 and 1280×720 at 125% zoom; prepare a backup recording. |
| **M8 — P1** | Voice transcription → Revenue Loop/outcome buttons → Pipeline Audit → Seller settings/changelog → persisted memory corrections → RSS news | Begin only after M7 passes; each feature gets its own functional gate and keeps P0 passing. |

For M4, validate the board on the presentation day and choose one whose relevant jobs are sufficiently recent for the matcher. “At least two roles” alone does not guarantee Revive under §7.5: the rules do not award points for hiring-role count, and old postings receive freshness penalties. Never replace job dates with today merely to achieve a lane.

The spec estimates M0–M7 at **16.5 hours**. Treat that as an optimistic hackathon baseline, not a delivery commitment. Dependency setup, fixture authoring, provider latency, visual refinement and integration can add time. Re-estimate after M2 and M4; if constrained, defer P1/P2 while retaining the complete P0 loop and its fallback paths.

## 6. Verification strategy

Focus tests on behavior that can break evidence, ranking or demo reproducibility:

- **Clock/formatting:** IST day boundaries, frozen date, lakh/crore conversion and rounding.
- **Parser/evidence:** Android/iOS formats, DD/MM versus MM/DD, multiline messages, system lines, narrow spaces, source offsets, exact/fuzzy/missing quotes.
- **Matcher:** full matrix; freshness boundaries; signals before evidence; deal-scoped eligibility; computed signal windows; bonus cap; LLM fallback and neutral verdict; percentile ties; campaign-category rule; Revive precedence.
- **Persistence:** reset preserves cache, repeated capture/matching/fetches are stable, snooze/dismiss/sent state survives unchanged evidence, launch and engagement update all related views consistently.
- **Content:** word/character limits, allowed proof points, no invented account/customer claims, clear cached/demo/simulated badges.

Create a compact fixture report during M1/M2 and assert the golden-path state transitions:

| State | Revive | Warm | Watch | Critical condition |
|---|---:|---:|---:|---|
| Reset baseline | 5 | 3 | 12 | Finvara first; Tripnest Watching |
| Implementation campaign launched | 5 | 9 | 6 | All six implementation accounts Warming |
| Default engagement plan applied | 7 | 7 | 6 | Tripnest/Zestcart Revive; Edunova Warm |

These snapshots exclude an added live account and assume reviewed demo verdicts/rules fallback, no snoozes and no outcomes that remove deals from the stalled population.

Keep manual golden-path rehearsal mandatory at M7. The spec places automated Playwright smoke coverage at P1; add it earlier only if integration defects justify it or the delivery scope is expanded.

Measure the spec's Today <500ms, cached generation <50ms, rules matching <300ms and signal check <10s targets on the actual presentation machine. Report whether metrics cover service time or full browser interaction; do not substitute one for the other.

## 7. Execution handoff

The next execution task is **D1 from the discovery expansion**: replace the deterministic demo compiler with versioned structured LLM extraction, cache/offline fallbacks, editable Product Profile and ICP review, and a clarification policy. After D1, resume live-source work shared by discovery D2 and the original M4.

The proposed decisions in section 3 are the main review points. Logo/design assets, presentation deadline and any hosting requirement can refine the plan; the stated defaults allow the local P0 build to proceed once execution is requested.
