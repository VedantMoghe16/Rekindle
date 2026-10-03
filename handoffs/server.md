# Server Agent Handoff

## Latest cycle: T120–T123 adaptive opportunity engine with real Andheri data

### Current task
Implemented VYAPAR_LEAD_ENGINE_BRIEF.md cycles 1–2 in full, plus a first slice of cycles 3–4. Also, at the product owner's request: real data around Andheri, and images on profiles. VYAPAR_BUYER_NEEDS_IMPLEMENTATION_PLAN.md (T119) has not been implemented yet; it is the next candidate.

### Work completed
- **Data:** `scripts/fetch-osm-andheri.mjs` snapshots 787 real OpenStreetMap places (ODbL) into `data/andheri-osm.json`. They are seeded as `Merchant.source="osm"` with only map facts. Paytm status, contact and timing are "unknown". Chains are tagged (OSM brand plus national/regional lists). The demo Paytm merchants moved from Indore to Andheri (same distance and bearing from the seller, so the golden path is intact). Pizza Dabba is now a high-volume buyer so the capacity clarification shows. Indore copy was removed.
- **Photos:** 15 openly licensed Wikimedia Commons category photos in `public/merchants/`, with credits in `data/merchant-images.json`. They are always labelled "Representative photo", never presented as the shop.
- **Engine:** `src/lib/vyapar/opportunity.ts` (rules-v2, pure). Gates: category, catalogue/stock, delivery, chain, active deal, opt-out, capacity (UNKNOWN blocks bulk buyers) and contact. Typed evidence with provenance. Relevance is separate from timing (stale/future signals ignored) and from confidence. Also contact status, unknowns, hypothesis, angle and action. `unsupportedClaims` blocks private payment data and unsupported outlet/rating claims.
- **Feedback:** `src/lib/vyapar/preferences.ts` covers skip reasons → preferences, `buildPrefs`, and "too far" on a lead under 1.5 km skipping only that merchant. APIs: `leads/[id]/feedback`, `leads/[id]/visit`, `preferences/[id]` (DELETE = undo), `preferences/clarify`.
- **Server:** `src/lib/vyapar/server/opportunities.ts` (context, evaluation, persisted snapshots, the event log, learning readiness, visit route). `hunts.ts` and `pitches.ts` were rewired; sends require a verified contact; reply outcomes are logged as `simulated`.
- **Schema:** Merchant gained source, osmId, street, cuisine, openingHours, website, brand, contactStatus, contactRole, paytmStatus and observedAt (mid, phoneMasked and monthlyTxns are now optional). VyaparLead gained opportunityJson, position and rankerVersion. New models VyaparPreference and VyaparEvent.
- **UI:** an opportunity card (photo, source pill, hypothesis, why-now, evidence, can-serve, contact, unknowns, save/skip-with-reason). On the hunt page: the clarification card, the "tuned to your feedback" panel with Undo, sections (on hold, in talks, not a fit) and a methodology note. Also the visit/intro composer, the merchant photo banner with public-listing facts, the visit route on Deals, and "What Vyapar learned" plus Learning readiness on My offers. Growth-loop percentages are relabelled "demo benchmark".
- The T112 `lead-list.tsx` is no longer used by the hunt page (it is superseded by the opportunity card) but is kept in place.

### Tests
- `bash scripts/verify.sh` PASS: 18 files / 115 tests, tsc and build. New tests are in `src/tests/opportunity.test.ts`.
- Manual run through the API:
  - The hunt shows 22 opportunities; the clarification lists Pizza Dabba.
  - Answering "no" removes it.
  - Skip, re-rank and undo restore the list.
  - Screens were checked by screenshot.

### Decisions / non-claims
- Real businesses never get invented ratings, owners, chats or Paytm status. Fictional fixtures are only used for the demo Paytm merchants.
- No real storefront photos: those would need a licensed source such as the Google Places API with a key. That is an open follow-up.
- No model is trained. Learning readiness shows 0/200 real labels.

---

## Latest cycle: T119 buyer-needs implementation plan

### Current task

T119 — product-owner-requested detailed plan for Claude to implement buyer needs, feasible offers and trusted introductions. Complete as documentation.

### Work completed

Created `VYAPAR_BUYER_NEEDS_IMPLEMENTATION_PLAN.md` (16 sections, ten bounded implementation cycles). It maps the eight discussed obstacles to product controls, defines seller-scoped data/state contracts, feasible matching/quotes, capped buyer-selected introductions, permission revocation, grounded messaging, sample/quality outcomes, metrics, pilot economics and test gates. Inspected the current working tree; preference/event/opportunity fields and locality fixtures are actively changing, so the plan requires reinspection and reuse before implementation.

### Files changed

- `VYAPAR_BUYER_NEEDS_IMPLEMENTATION_PLAN.md` — new detailed proposal and Claude kickoff instruction.
- `TASKS.md` — completed documentation task T119.
- `handoffs/server.md` — this cycle; previous handoffs preserved below.

### Tests executed

- `git diff --check`.
- Local Markdown link existence check and review against inspected code/spec/earlier brief.

### Test results

Whitespace check passed and local linked brief exists. No product code, runtime validation, live integration or performance claim was introduced by this documentation cycle.

### Important decisions

First release uses fictional buyer requests and seller offers with real eligibility behavior; contact requires buyer-selected scoped introduction. Multi-seller ownership is a prerequisite because current getSeller/deal assumptions are single-seller. Availability confirmation is not inventory reservation. Reported dispatch/order and buyer receipt/verified payment are separate evidence. Limits and pilot size are configurable proposed defaults, not empirical facts.

### Remaining work

Claude should reconcile the new requested flow with PRODUCT_SPEC.md, register available task IDs for B01–B10, and start with B01 while preserving current agent work. The earlier adaptive brief remains complementary. Only documentation T119 is marked complete; its product implementation cycles remain proposed.

### Blockers

Live Release B/C requires authorized merchant identity/data scope, actual channel integration and an operational owner. These do not block the labelled offline Release A demo.

### Instructions for next agent

Read the new plan and the earlier adaptive brief, then inspect the latest code and dirty changes. Execute one bounded cycle at a time, retain the original V7 path, report provenance accurately, and update tests/tasks/handoff. Do not commit or push.

---

## Latest cycle: T118 adaptive lead engine brief

### Current task

T118 — product-owner-requested research and implementation brief for adaptive Vyapar lead generation. Complete as documentation; no product code or model was changed.

### Work completed

Reviewed the Vyapar product spec, task ledger, existing fixed scorer/hunt/pitch code and Paytm's public merchant product documentation. Wrote `VYAPAR_LEAD_ENGINE_BRIEF.md` with a source-permission matrix, seller–buyer–offer opportunity model, cold-start personalization, future learning criteria, grounded outreach, four bounded implementation cycles and honest demo acceptance.

### Files changed

- `VYAPAR_LEAD_ENGINE_BRIEF.md` — new proposal for Claude.
- `TASKS.md` — records T118 as a completed documentation task.
- `handoffs/server.md` — this record.

### Tests executed

- `git diff --check`.
- Read-only source/code inspection and primary-source web research. No runtime/product behavior changed.

### Test results

Markdown/diff whitespace check passed. No integration, model, live Paytm data access or conversion lift is claimed.

### Important decisions

Treat payment trends as activity signals rather than proof of SKU need. Use explicit seller feedback for immediate personalization; train any learned ranker only after verified real outcomes exist. Keep data entitlement and business-contact permission as open integration dependencies. The proposal does not override `PRODUCT_SPEC.md`.

### Remaining work

Claude may implement the four cycles in the brief under the repository workflow, beginning with an opportunity contract and truthful eligibility/ranking. T114–T117 and other ledger work remain separate.

### Blockers

No approved cross-merchant Paytm data feed or verified business-contact channel is evidenced in this repo. These are blockers for live claims, not the fictional offline demo.

### Instructions for next agent

Read `VYAPAR_LEAD_ENGINE_BRIEF.md` and the required workflow/spec/task files. Preserve the in-progress Vyapar implementation. Execute one bounded cycle at a time, distinguish simulated from live evidence, and do not commit or push.

---

## Current task

T113: Paytm for Business app shell and the Vyapar AI end-to-end loop. This was a user-directed pivot: "make it an app with clean UI; think like a Paytm product head". PRODUCT_SPEC.md now opens with the Vyapar AI section (V1–V7), which supersedes conflicting SaaS sections.

## Work completed

- **App shell:** `src/app/(app)` is a separate root layout. It has a phone frame on desktop and full-screen on mobile, Paytm tokens in `src/app/styles/paytm.css`, a Demo drawer (provider status and reset) and toasts. The legacy Rekindle pages moved unchanged into `src/app/(legacy)` (Today is now `/today`; the sidebar and capture links were updated). Two root layouts keep the CSS isolated.
- **Domain:** Prisma models Merchant, VyaparSeller, VyaparHunt, VyaparLead, VyaparDeal, VyaparMessage, VyaparMemory, VyaparAction and VyaparCampaign. `data/merchants.json` holds 32 fictional Indore merchants with geo, MCC, QR band, web profile and signals. `prisma/vyapar-seed.ts` seeds Rahul and 9 deals; it is called by `resetDemo`, `npm run vyapar:seed` and `POST /api/vyapar/demo/reset`.
- **Engines (pure, tested):** `src/lib/vyapar/` contains `taxonomy`, `geo`, `planner`, `scoring` (T112 breakdown preserved), `replies` (Hinglish understanding), `counter` (plays), `pitch`, `growth` (revive, objections, campaigns).
- **Services:** `src/lib/vyapar/server/` contains `context` (seller, `liveNow`, Cognee remember), `hunts` (leads in an existing deal are marked IN_TALKS), `pitches`, `conversation` (reply, memory, counter, autopilot, n8n action) and `insights`.
- **Routes:** `/api/vyapar/*` covers hunts, leads/[id]/pitch, leads/[id]/send, deals/[id]/reply, deals/[id]/message (POST send, PATCH autopilot), ask, campaigns, tts, revive/[dealId], webhooks/n8n and demo/reset.
- **Pages:** `/` home and `/vyapar` plus hunts, leads, deals, deals/[id], merchants, campaigns and business.
- **Providers:** `sarvamTts` (Bulbul) and `n8nVyapar` (single `N8N_VYAPAR_WEBHOOK_URL`, event-routed), plus the new workflow `n8n/vyapar.json`, documented in `n8n/README.md`.
- **Infra:** `@next/swc-darwin-arm64` moved to optionalDependencies, with a surgical lockfile edit, because the hard dependency broke `npm ci` on Linux.

## Tests executed

- `bash scripts/verify.sh`: PASS (prisma validate/generate, tsc, 17 files / 101 tests, next build).
- Golden path exercised through the dev server APIs. The hunt ranks Karan's Cafe #1 (6 leads in talks, 4 skipped with reasons). The price objection is parsed with the ₹3.50 competitor price, and the counter cites ₹4.20. The sample request moves the deal to SAMPLE_REQUESTED, with a dispatch action and restock-timing memory.
- All 8 screens were screenshot-checked at 1440×900.

## Important decisions

- A separate merchant domain instead of overloading Account/Deal/StallCategory, so the legacy tests and screens stay green. Reuse happens at the provider/engine level.
- `liveNow()` combines the DEMO_TODAY date with the real time of day for Vyapar writes, so live activity sorts after the seed.
- The counter-play choice is labelled "Growth loop" (deterministic win-rate engine), not Claude. Memory cards say Local unless Cognee is configured. Actions say Simulated unless n8n answers.
- The buyer side is simulated in the composer ("Reply as Karan (demo)") until T115 (WhatsApp inbound).

## Remaining work

T114 (warm the cache with real keys and pre-render the voice), T115 (WhatsApp inbound/outbound), T116 (editable offers), T117 (other seller categories).

## Blockers

None for the offline demo. Live AI needs ANTHROPIC_API_KEY / SARVAM_API_KEY / COGNEE_BASE_URL / N8N_VYAPAR_WEBHOOK_URL in `.env`.

---

# Previous cycle

## Current task

T112 — Vyapar lead priority and contact routing slice, completed as one bounded user-requested lead-generation task.

## Work completed

Inspected the existing in-progress Vyapar design and preserved all unrelated Claude changes. Added a five-part lead priority breakdown in `src/lib/vyapar/scoring.ts`: relevance, proximity, capacity, timing and evidence. Current buying signals can now raise a lead above a merely nearby/high-fit account while sparse evidence is visible in the score.

Stored the breakdown alongside existing lead evidence in `VyaparLead.reasonsJson` with a legacy array reader, so existing seeded hunts remain readable without a schema reset. Hunt results now expose the recommended first contact, role, channel and reason. Lead cards show this routing guidance and score dimensions before the pitch action. Added a regression covering timing beating a quiet account and score total consistency. Added completed T112 to TASKS.md.

Prior handoff release observations were not revalidated online this cycle. Recheck supported framework/runtime versions and compatible Zod/converter metadata when registry access is restored; do not treat the prior expected patch version as a verified published release.

## Files changed

- TASKS.md — marked the bounded T112 lead-generation slice complete.
- handoffs/server.md — recorded this cycle and retained prior planning decisions below.
- src/lib/vyapar/scoring.ts — introduced score breakdown and timing-aware priority calculation.
- src/lib/vyapar/server/hunts.ts — persisted/read breakdown metadata and contact routing guidance.
- src/components/vyapar/lead-list.tsx — displayed contact recommendation and score dimensions.
- src/app/(app)/vyapar/hunts/[id]/page.tsx — passed new lead metadata to the cards.
- src/app/styles/paytm.css — styled score dimension chips.
- src/tests/vyapar.test.ts — added scoring regression coverage.

No product or protected orchestration files were changed. No commits, pushes or branch changes.

## Tests executed

- `npm test -- --run src/tests/vyapar.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`

## Test results

Vyapar tests pass: 20/20. TypeScript passes. `git diff --check` passes. The production build is blocked before compilation by the existing Next/TypeScript integration error: `Could not parse output from TypeScript's --showConfig`. No lead-specific build error was emitted. The Next diagnostic also reports an unavailable registry lookup; no package changes were made.

## Important decisions

The lead score remains a single 0–100 total for the existing UI, but its calculation is now explainable: relevance 35, proximity 15, capacity 15, timing 20 and evidence 15. The recommended first contact uses the merchant's explicitly seeded owner name and labels that person as `Owner / decision maker`; the system does not invent additional personal contacts. WhatsApp remains the first channel because that is the existing approved pitch path.

Lead evidence JSON is backward-compatible with the prior raw `Reason[]` format. New hunts write `{ reasons, breakdown }`, while old seeded hunts continue to render reasons without a breakdown.

The product specification remains authoritative. Its “lanes invariant under varying LLM verdicts” claim conflicts with the formula; pin validated warmed demo verdicts and test arbitrary verdicts separately, without altering matching rules. Midpoint percentile reproduces Finvara=96 without adjusting its value. The 12-versus-14 Watch and 30-versus-31 CSV narrative conflicts remain documented; UI metrics are computed.

T095 solely owns account/deal creation and the POST endpoint, shared by Capture and full Add Account. Mini-form missing value defaults to zero with an honest unknown-value display. T092 owns additive extraction-preview API, T042 draft-edit API, T048 campaign list and T101 redacted cache-status API. Minimal additive schema decisions cover interaction provenance, historical isolation, roadmap keys and optional persisted clock offset; do not edit PRODUCT_SPEC.md to conceal these interpretations.

T110 supplies a validated implementation campaign bootstrap before T047; T054 refreshes it during full P0 warm-up. T104 installs the P0 e2e harness before T074 extends it for P1. Browser prerequisites must be provisioned outside the protected verification gate. Domain dates use the shared clock; external future dates remain unchanged but are excluded from live eligibility/counts. Network/provider calls stay outside SQLite transactions.

T086 is supervisor-owned presentation evidence and T099 is team audio acquisition. Missing real audio/projector/video evidence is never fabricated. P2 is optional under §0.7; supervisor records selection/deferment. T087 can perform its audit without waiting for presentation day, but cannot claim full readiness with unmet required evidence.

## Remaining work

Continue with the next explicitly selected product task. T001–T111 remain governed by the existing task ledger; this T112 slice does not claim that the broader Rekindle acceptance plan is complete. The Next build parser issue remains unresolved in the existing tree.

## Blockers

`npm run build` currently fails before compilation because Next cannot parse TypeScript's `--showConfig`; registry lookup is also unavailable. This is a pre-existing repository/toolchain blocker outside the bounded lead changes.

## Instructions for next agent

Read the required four documents and inspect status/diff/log. Preserve the existing Claude design work and this Vyapar lead slice. If fixing the build, isolate the Next/TypeScript `--showConfig` parser issue before making product changes. Do not commit, push, change branches or edit protected orchestration files.
