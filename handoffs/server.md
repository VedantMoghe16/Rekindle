# Server Agent Handoff

## Latest cycle: navigation, intro, and smarter follow-ups

- **Navigation:** `HomeNav` (the app bar) is at the bottom of every main Vyapar screen with "Vyapar AI" active. `VyaparTabs` became a top tab strip under the AppBar (Find · AI team · Deals · Memory). The back arrow was removed on the four tab roots.
- **Intro:** the first-run `VyaparIntro` overlay (4 steps, localStorage `vyapar-intro-seen`, reopened by the ? in the Vyapar app bar) replaces the 3-step strip.
- **Follow-ups learn** (`templateScore`, `BENCHMARK`): templates come in variants per reason. The agent picks the unused variant with the best reply rate: own results plus a 0.25-weighted demo benchmark plus a small exploration bonus. "What works" lists the rates, and each draft explains its choice (`whyJson`).
- **Voice notes:** `channel` is "voice" for never-replied leads from attempt 2. `runDueFollowups` sends Sarvam TTS as a Telegram voice note (`deliverToTelegram(..., { voiceOnly: true })`) and stores a voice message.
- **Promises:** `promiseDate` / `latestPromise` read festivals (Diwali 8 Nov 2026 and others), N din/hafte baad, next week, agle mahine / ek mahine ka stock, kal, parso, weekdays and "N tareekh". They also read TIMING memories from calls.
  - Before the date: held with `promise_wait`.
  - On the date: reason PROMISE, the "promise" template, and the silence and lost cool-down rules are relaxed.
  - "60 din ka credit" is not a promise.
- The old Revive cards were removed from Deals; the follow-up agent covers them, and the hub's revive banner links to Follow-ups. Stale unapproved drafts were cleared once so they re-plan under the new rules.
- 150 tests pass.

## Latest cycle: follow-up agent for quiet and lost leads

- **Rules** (`src/lib/vyapar/followups.ts`, 8 tests):
  - Cohorts: NO_REPLY, WENT_QUIET, OBJECTION_STALLED, SAMPLE_CHECKIN and LOST_REVIVE.
  - `newReason` is required: new tier since last contact, credit, backup supplier, quality sample, festive signal, sample still open, or a polite last nudge.
  - Vetted `TEMPLATES` are never repeated on the same deal.
  - Guardrails: opt-out words block forever; 4+ silent days; 4+ days between follow-ups; at most 3 unanswered; never while the buyer is waiting on us; lost deals after 14 days (30 if not interested) and only with a new reason; content checks (real prices only, no private data, no pressure, one question, at most 60 words).
  - risk = review for price changes and lost deals.
- **Service** (`server/followups.ts`):
  - `planFollowups` (single-flight) has Gemini personalise the template. If the personalised text fails a content check or changes a price, the template is used.
  - Each follow-up is scheduled at the shop's quietest hour, with a daily cap of 10.
  - `runDueFollowups` re-checks before sending. `approve`/`skip` re-check edits. `onBuyerReply` (hooked into `receiveReply` and `receiveCallResult`) cancels queued follow-ups and credits replies.
  - `ensureFollowupWorker` ticks every 60 s.
- **Modes** (`FollowupSettings`): review (default), auto (low-risk only) or off.
- **UI:** `/vyapar/followups` (Deals → Follow-ups card) shows: waiting for you (reason, message, timing, safety checks, Skip/Edit/Send now/Approve), scheduled, "Not messaging, on purpose" with the guardrail that stopped each, and recent results with reply tracking.
- **Data:** the seed adds Pizza Dabba (lost before the ₹4.20 tier: revivable) and Shake It Up ("message mat bhejo": blocked). Both were inserted into the live database without a reseed.

## Latest cycle: instant pitch page, Demo button removed

- The pitch page took 10–25 s because it waited for Gemini 2.5 Flash, which was "thinking", so Pitch looked broken.
  - Fast-tier Gemini calls now send `thinkingConfig.thinkingBudget: 0` (about 2.5 s).
  - The page renders the grounded draft immediately (`getPitch(id, false, { llm: false })`), then `PitchComposer` fetches `GET /api/vyapar/leads/[id]/pitch` and swaps in the AI draft unless the user has edited it.
  - `leads/[id]/loading.tsx` adds instant feedback.
- `DemoDrawer` was removed from the (app) layout. The component file is still there but unused.

## Latest cycle: Find and the AI team are one flow

- **Find** is where you ask (type or speak). The results page has an `OutreachBar`: "Message & call top 3 · at their quietest hour · real calls", with Start and a plan sheet (1–5 shops, timing, real or simulated calls).
- Start calls `POST /api/vyapar/fleet {huntId, leadIds, timing, callMode}`. `FleetRun.leadIdsJson` stores the chosen shops, and the run contacts exactly those, ordered by the AI re-ranker. Without leadIds it still runs from the business brief.
- It returns `{runId, alreadyRunning}` and navigates to `/vyapar/fleet?run=ID`.
- **AI team** tab: live progress, Stop, results and "Earlier outreach" (`recentRuns`). It has no start controls of its own; the empty state points to Find. The business brief is a small link at the bottom.
- The Find hub shows a 3-step strip (Ask → Check → Start). The home team card links to Find when nothing has run.

## Latest cycle: Pitch for every lead

- Every eligible lead now gets `action: "pitch"`, including public OSM listings with no verified contact. The contact gate stays UNKNOWN and is shown honestly ("Owner not verified yet…"). Pitches and calls route to the demo contact.
- The angle is chosen from evidence (STRONG_NEED, EXPANSION or CATEGORY_FIT); INTRO is no longer produced. `sendPitch` and `ensureDealForLead` no longer require a verified contact.
- Nameless listings: `firstName("")` returns "", and `tidyGreeting` turns "Namaste  ji" into "Namaste ji". This applies to drafts, templates, counters and the call opener.
- The pitch page offers "Prefer to visit? Add to visit route" as a secondary option for unverified contacts.

## Latest cycle: Paytm-style chat, call summaries, app-wide translation, voice search

- **Chat UI:** the deal conversation uses Paytm tokens and a white app bar (the WhatsApp colours are gone; the `--wa-*` variables now hold Paytm values).
- **Calls:** each call shows a `CallCard` with a Gemini plain-English summary, quote and next step. "Read full transcript" opens the exact transcript as spoken; "Show in English" appears when an English version exists.
  - `receiveCallResult` stores `meta.summary`, `nextStep` and `transcript[{who,role,text,en,language}]`.
  - Live calls fetch the spoken-language transcript from Sarvam Analytics (`fetchTranscript`; the `content` field is native script).
  - Simulated calls are Hinglish, each with an English version.
- **Translation:** the globe button in every app bar opens a picker for the 22 Sarvam languages. `Translator` (in the layout) swaps visible text, placeholders and aria-labels in place, using `/api/vyapar/translate` (Sarvam sarvam-translate:v1, cached in the `Translation` table and in localStorage). `[data-no-translate]` is skipped, and transcripts carry it.
- **Voice search:** the Find mic records with MediaRecorder and sends it to `/api/vyapar/listen` (ffmpeg converts to 16 kHz WAV, then Sarvam STT in transcribe mode auto-detects the language and translates to English). The search runs right away with the original text plus `english`. The Hinglish/EN/हिं toggle has been removed.

## Latest cycle: Stop button and contact timing

- **Stop:** `POST /api/vyapar/fleet/[id]/cancel` marks the run CANCELLED. The worker checks before every step and while waiting, so nothing new is sent or dialled. A ringing call finishes and is recorded.
- **Timing** (`src/lib/vyapar/contact-timing.ts`, tested): business hours run from the first to the last hour with regular payments, and the quietest hour is the open hour with the fewest payments. Strategies: quiet (default), after_open, now.
  - Demo merchants get a stable hourly pattern by shop type (labelled demo data). Real deployments would read Paytm's hourly aggregates.
  - Each target gets `scheduledFor`, `timingNote` and `hoursJson`. The run waits per target (earliest first, one at a time) and then sends Telegram and calls.
- **Resume:** a run is idempotent per step and resumed by `ensureWorker` when viewed (after a server restart). An orphaned live run from before this change was marked stopped rather than resumed, to avoid a surprise re-dial.
- **UI:** "When to message & call" options, a Stop button, the current step, and per-shop "When:" plus an hourly payments chart.

## Latest cycle: smart Sarvam calls (context hook, mid-call tools, KB, states)

- `src/lib/vyapar/agent-brain.ts` (pure, tested): quote from tiers, ≤25-word counter via choosePlays + known competitor price, objection/qty parsing, offer sheet, lessons, top plays.
- `src/lib/vyapar/server/agent-tools.ts` and `POST /api/vyapar/agent/[tool]` (auth via `?secret=`, `x-vyapar-secret` or Bearer = `VYAPAR_WEBHOOK_SECRET`). Tools: `context` (on_start: known facts, filled slots, past objections, lessons, top 3 plays, offer sheet), `get_counter`, `quote_price`, `log_objection`, `schedule_followup`, `book_sample` (dispatch action plus seller Telegram alert), `send_on_telegram`.
  - Deal resolution order: deal_id → caller phone (deal.demoPhone) → the AI call in progress → last AI call to the demo phone. This also works for inbound callbacks.
  - Prisma only; measured 0.08–0.66 s over the tunnel.
- The chat refreshes every 5 s during a live call, so tool writes appear mid-call.
- `docs/vyapar/kb/ecopack-knowledge-base.md` is generated from the real offer sheet (`npx tsx scripts/build-agent-kb.ts`), with no invented facts.
- `docs/vyapar/sarvam-agent-flow.md` has the exact Sarvam configuration: on_start variable mapping, tool bodies/templates, the 6 states, slot filling and layered objections.
- **Not done (manual, in the Sarvam dashboard):** creating the tools, hook, KB upload and states on the published agent, then publishing a new version and updating `SARVAM_APP_VERSION`.

## Latest cycle: autonomous AI sales team (onboarding → fleet → sequential calls → Cognee → home report)

- **Onboarding** (`/vyapar/onboarding`, `server/onboarding.ts`): 7 plain questions → Gemini brief (summary, ideal customers, sales needs, offers, hunt prompt). Saved in `VyaparOnboarding` and written to memory.
- **Fleet run** (`/vyapar/fleet`, `server/fleet.ts`, `POST /api/vyapar/fleet`, poll `GET /api/vyapar/fleet/[id]`):
  - Steps: hunt from the brief → new businesses only (no existing deal) → Gemini re-ranker (why + best time; falls back to rules order) → grounded pitch per target → `sendPitch` on Telegram, routed to the demo contact → calls strictly one at a time (start → wait for the webhook/Analytics result → record a plain outcome → next) → Gemini report.
  - Persisted in `FleetRun` / `FleetTarget`. Only one run at a time.
  - Always at least 2 targets; a priority without a phone gets a simulated call, labelled as such.
- **Demo contacts** (`DemoContact`, editable on the fleet page, `PUT /api/vyapar/fleet/contacts`): priority N's Telegram and calls are routed via `VyaparDeal.demoChatId` / `demoPhone`. Priority 1 defaults to +919755812313 / Telegram 2145717919. Priority 2 is still empty.
- **Business memory** (`KnowledgeEvent` + Cognee): `remember()` now saves a plain-language row and pushes it to Cognee, tracking status as saved / pending / failed / skipped. Shown on `/vyapar/memory`, which has an Ask box over Cognee.
- **Home:** an "Your AI sales team" card with the latest report, per-target results and memory count, plus an AI Sales Team tile. Vyapar tabs are now Find · AI team · Deals · Memory.
- **Telegram:** WhatsApp copy → Telegram everywhere. The Telegram listener accepts replies from every demo contact's chat and routes each to the deal last messaged in that chat.
- **Verified:** a simulated run picked Karan (#1, sample) and Daily Bread (#2, objection), both Telegram pitches were delivered, the report was written, and 10/10 memory events reached the Cognee graph. 128 tests pass and the build passes.

## Latest cycle: demo channels (all calls to one phone, WhatsApp → Telegram)

- **Calls:** every AI call (any merchant) rings `DEMO_CALL_PHONE=+919755812313`. `canCallLive=true` for all verified-contact deals.
- **"Send on WhatsApp" → Telegram:** `src/lib/providers/telegram.ts` uses the team bot @Rekindle_yaytm_bot; the token was copied from the teammate's `.env`. Messages go to `VYAPAR_TELEGRAM_CHAT_ID=2145717919`:
  - Pitch text and the Sarvam voice note (converted to OGG/Opus with ffmpeg) are delivered on send.
  - Every later outbound message (Autopilot counter, revive, buyer-request reply) goes out through `sendMessage → deliverToTelegram`.
  - Delivered messages carry `metaJson.telegram=true`.
- **Inbound:** `npm run telegram:poll` runs in screen `vyapar-ui-bot` (log in `.telegram-poll.log`). Text from the demo chat → `receiveTelegramReply` → buyer reply on the deal most recently messaged there → Autopilot answers back in Telegram.
- **The teammate's own listener (screen `vyapar-bot`) was stopped at the user's request**, since only one getUpdates listener can run per bot. Restart it with `cd ~/shivam/Rekindle-vyapar && npm run vyapar:bot` (stop ours first).

## Latest cycle: Sarvam call flow integrated into the UI (teammate's vyapar-integration work)

- **Same flow as the teammate's CLI/API:** hunt → merchant → Pitch → **AI call**. In the Pitch composer the AI call tab offers "Call now (live)" and "Simulate call" (sample / objection / callback / no answer). `POST /api/vyapar/leads/[id]/call` opens or reuses the deal, then calls.
- **In the chat:** 📞 opens the panel (11 inputs, opening line, live call, simulator). While a live call is dialing, a "Priya is on the call…" banner polls `GET /api/vyapar/calls/[attemptId]`. That endpoint falls back to Sarvam Analytics (`pollAttempt`) after 15 s if the webhook hasn't arrived.
- **Simulated calls are real-path:** `src/lib/vyapar/call-simulation.ts` (the teammate's scenarios, with full transcripts) feeds `processSarvamWebhook`, the same code a live webhook uses. They are labelled "(simulated)".
- **CLI:** `npm run vyapar:call -- <dealId|leadId|merchantId> [--simulated --scenario x | --live --wait]` or `<attemptId> --poll`.
- **Memory loop verified:** objection call → the next call's `past_objections` carries the quote, the follow-up opening line is used, and the sample is agreed.
- Calls pitch paper bags at ₹5/bag so the ₹4.20 bulk counter matches.
- **Config:** `DEMO_KARAN_PHONE` was copied from the teammate's `.env` (their test recipient). The live call preview for Karan is ready (`canCallLive=true`). No live call has been placed from this branch yet.

## Latest cycle: T128–T129 live Gemini + Cognee, Sarvam agent port

- **Gemini:** the key is in `.env` with `LLM_OFFLINE=false`, and `gemini-2.5-flash` works through `callStructured`: the plan, the buyer need (Hinglish) and reply understanding all return correct, schema-valid output. Demo status shows gemini as live.
- **Cognee:**
  - `npm run cognee:ingest` added 50 docs and cognify built the graph (stored in `cognee/.data`, gitignored).
  - `npm run cognee:demo` answered all 5 questions correctly, including multi-hop ones (Mumbai Kraft House ← Sweet Nest grease complaint); see `data/cognee/answers.md`.
  - The bridge runs on 127.0.0.1:8765 (`npm run cognee:server`). `.env` has `COGNEE_BASE_URL` and `COGNEE_DATASET=vyapar`, and app Ask returns `provenance: cognee`.
  - The asyncio "Event loop is closed" / SSL tracebacks after a run are harmless teardown noise.
- **Sarvam voice agent:**
  - The teammate builds the agent on branch `vyapar-integration` (worktree `../Rekindle-vyapar`), and their `docs/vyapar/sarvam-agent.md` is now adopted here.
  - Their client is ported as `src/lib/providers/sarvam-agent.ts`. The call preview/start route and webhook use the same path and secret as theirs.
  - The chat 📞 panel offers "Call now via Sarvam" when configured, and shows the missing settings otherwise.
  - Sarvam key and all agent IDs (org, workspace, app `Vyapar-SDR-ecff21d0-7347` v1, connection, agent phone) are now in `.env`, with `PUBLIC_BASE_URL` set to the tunnel and a generated `VYAPAR_WEBHOOK_SECRET`. TTS works on `bulbul:v3` with voice `priya` (v2 is deprecated). `sarvam-105b` chat returned empty JSON for pitches (reasoning model), so drafts use Gemini unless `SARVAM_DRAFTS=true`. The only setting left for a live call is `DEMO_KARAN_PHONE`.
- `../Rekindle-autopilot` (branch `vyapar-autopilot`) is only a snapshot of this branch's earlier work.
- verify.sh PASS: 20 files, 128 tests, build.

## Latest cycle: T124–T127 Gemini, buyer needs, Cognee SDK, Sarvam agent

### Work completed
- **Gemini (T124):** a Gemini provider in `src/lib/providers/llm.ts` (generateContent JSON mode plus a zod schema). `defaultProvider()` picks `LLM_PROVIDER`, else Gemini when its key exists. Provider labels now come from `callStructured().provider`.
- **Buyer needs (T125):**
  - Engine: `src/lib/vyapar/needs.ts` (pure).
  - Service: `server/needs.ts`.
  - Models: VyaparOffer, VyaparNeed, VyaparIntroduction.
  - Fixtures: `data/supplier-offers.json` (8 fictional suppliers plus EcoPack offers; 3 feasible, 1 stale stock, 5 decoys).
  - APIs: `needs/preview`, `needs`, `needs/[id]/introductions`, `requests/[id]`.
  - Pages: `/buy` and `/buy/[id]` (buyer, "Viewing as Karan's Cafe (demo buyer)") and `/vyapar/requests/[id]` (seller). Plus a Buyer-request card on My Deals and a Buy Supplies tile on Home.
  - Competitor packaging merchants are excluded from Rahul's buyer hunts.
- **Cognee (T126):**
  - `scripts/build-cognee-dataset.ts` writes 51 docs to `data/cognee/`.
  - `cognee/settings.py`, `vyapar_memory.py` and `server.py` (SDK 1.6.2 in `cognee/.venv`, gitignored).
  - npm scripts: `cognee:dataset`, `cognee:ingest`, `cognee:demo`, `cognee:server`.
  - `askMemory` falls back to a local search over the dataset for supplier questions.
  - Docs: `docs/vyapar/cognee.md`.
- **Sarvam agent (T127):** `docs/vyapar/sarvam-agent.md`, the agent-vars and call-result endpoints, `receiveCallResult` and `agentVariables` in `conversation.ts`, and the chat AI-call panel.
- **Copy:** n8n removed from the product story; the side panel now explains Sell and Buy.

### Tests
- 19 files / 124 tests pass, and tsc and the production build pass. New: `src/tests/needs.test.ts`.
- API golden path:
  - preview → publish → 3 offers (PackRight ₹8.60, EcoPack ₹9, GreenBox ₹9.50), with Mumbai Kraft House needing confirmation and 5 exclusions with reasons.
  - Requests: EcoPack accepted, a duplicate was deduplicated, and an excluded offer was rejected (409).
  - The seller accepted, and the thread shows the buyer's request, a verified memory and one sample task.
  - Agent vars returned and the call result moved the stage to OBJECTION.
- Cognee bridge `/health` and `/api/v1/add` were verified. Cognify and search are **not** verified because there is no GEMINI_API_KEY in `.env` yet.

### Blockers / next
- Add `GEMINI_API_KEY` (and `LLM_OFFLINE=false`) to `.env`, then run `npm run cognee:ingest && npm run cognee:demo`.
- T128: connect the published Sarvam agent (needs its URL/version and API access).

---

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
