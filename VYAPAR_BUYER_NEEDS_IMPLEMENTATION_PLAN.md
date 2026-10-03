# Vyapar buyer needs, feasible offers and trusted introductions

Status: detailed implementation proposal requested by the product owner, 3 October 2026. Intended executor: Claude Code. This document specifies future work; it does not claim that a buyer inbox, multi-seller matching, contact permission, stock confirmation or a learned model is implemented.

Start by reading this file alongside [the adaptive lead engine brief](VYAPAR_LEAD_ENGINE_BRIEF.md), `PRODUCT_SPEC.md`, `TASKS.md`, `AI_WORKFLOW.md` and `handoffs/server.md`. Follow the repository workflow, preserve concurrent work, and complete one bounded implementation cycle at a time. Do not commit, push or alter protected orchestration files. This user request authorizes planning the buyer-demand extension. Before implementing the new flows, reconcile them with the product spec and record the interpretation there and in the handoff. The Vyapar V1–V7 section remains the current product authority; legacy SaaS requirements do not define this new buyer workflow.

## 1. What the release should accomplish

Help a merchant find a relevant business partner and start a welcome, useful conversation. A successful match must connect an actual or explicitly provisional buyer need to a seller's feasible offer. Measure confirmed needs, accepted introductions, meaningful replies and fulfilled samples separately.

Use two entry paths:

1. **Buyer has a need:** “Need 500 pastry boxes by Friday, delivered to my shop.” The buyer confirms a structured request and receives up to three comparable offers. Contact starts only with the seller the buyer chooses.
2. **Seller is looking for buyers:** Rahul's existing hunt finds plausible merchants. Until need and contact permission are confirmed, show a research candidate or a permissioned qualification question. A high rank does not authorize contact or assert purchasing intent.

Both paths converge on the existing draft, conversation, objection memory and action workflow. The first release is an introduction service with a sample/trial path. It does not require checkout, escrow, warehouse operations or a new graph database.

### Scope order

| Release | Deliverables | Evidence required |
|---|---|---|
| A: credible demo | Buyer need creation; seller offers; feasibility matching; maximum three offers; buyer-selected introduction; grounded draft; simulated replies and outcomes | Deterministic fixtures and acceptance tests; visible Demo data/Simulated labels |
| B: controlled pilot | Authorized merchant identity/contact context; offer reconfirmation; actual messaging integration; fulfilment and feedback capture; basic operational dashboard | Verified channel events and consenting real merchants |
| C: learning and expansion | Trained ranker, measured pilot economics, additional categories/localities, optional POS adapters | Real outcome data and evaluation; operational capacity |

Implement Release A end to end first. Build Release B and C only when their prerequisites actually exist; report dependency gaps without inventing live behavior.

## 2. Why each proposed feature exists

These are product hypotheses, not documented reasons Paytm has declined this idea.

| Obstacle | Mechanism | Product decision | Acceptance evidence |
|---|---|---|---|
| Payments do not establish demand | Explicit buyer need and one-question qualification | Separate inferred relevance from buyer-confirmed need | A transaction spike never creates a confirmed need |
| Existing suppliers are trusted | Sample, trial or backup-supplier offer | Ask whether the buyer wants an alternative; do not presume replacement | Buyer can select backup/trial and retain their supplier |
| Introductions create spam | Buyer controls, capped offer shortlist, permission checks | Up to three offers per request version; one chosen seller gets initial contact | Fourth introduction blocked; mute/revoke checked at send time |
| Stock, quantity or deadline do not fit | Structured offer and feasibility gates | Stock and delivery promises must be current and reconfirmed | Incompatible or unknown critical fields cannot appear as ready |
| Quality and reliability are uncertain | Separate identity, sample and delivery evidence | A payment merchant badge is not a quality endorsement | Card distinguishes business identity from fulfilment history |
| Merchants dislike data entry | Short forms, text/voice-assisted extraction and reconfirmation | Extract a draft, let merchant confirm; unknown remains unknown | Missing fields retained and asked once; no invented availability |
| Deals happen elsewhere | Lightweight outcome confirmation with source | Buyer/seller claims remain separate; unknown is a valid outcome | Internal chat creation never counts as delivered or paid |
| Business value is uncertain | Small pilot with defined funnel and cost counters | Validate useful introductions before monetization | Metrics have explicit denominators, maturity windows and provenance |

## 3. Current repository and integration boundaries

Code inspected on 3 October 2026 in a dirty, concurrently edited working tree. Relevant current implementation:

- `src/lib/vyapar/server/hunts.ts`: generates hunts, stores leads and links merchants already in a deal.
- `src/lib/vyapar/scoring.ts`: fixed scoring and recent-signal selection; treat any subsequent edits as new implementation requiring inspection.
- `src/lib/vyapar/taxonomy.ts`: seller catalog, tiers, samples and delivery policy. In-progress additions include category coverage, stock booleans and monthly capacity; a boolean does not establish fresh stock quantity or a delivery commitment.
- `src/lib/vyapar/server/context.ts`: `getSeller()` selects the first seller. That assumption must be removed from the new multi-seller matching flow.
- `src/lib/vyapar/server/pitches.ts` and `conversation.ts`: draft, simulated thread persistence, replies, counter-plays and actions. Inspect again before editing: current first-message persistence does not establish external delivery.
- `prisma/schema.prisma`: Merchant and Vyapar domain models. In-progress fields include opportunity snapshots, preferences and event logs. These were observed in the working tree; their migrations, runtime integration and verification are not established by this plan.
- Existing leads, hunts, deals, offers and reset screens live under `src/app/(app)/vyapar` and `src/app/api/vyapar`.

Reuse these components and providers. Extend the current relational store and typed services rather than replacing the application or duplicating preference/event models.

Paytm publicly documents payment analytics and, in its Billing POS, inventory/catalog/product reports. Connect Plus already offers messaging and engagement capabilities. Those facts do not grant this prototype access to cross-merchant data or business contacts. Source boundaries are described in the earlier brief. Production adapters require a specific approved Paytm data contract. Demo adapters must return explicitly fictional records, even when a merchant's public place listing or image is real.

Sources: [Paytm merchant analytics](https://business.paytm.com/payment-analytics), [Billing POS](https://business.paytm.com/pos-billing-software), [Connect Plus](https://connectplus.paytm.com/), [payment event webhooks](https://business.paytm.com/docs/callback-and-webhook/). Marketing pages establish advertised capabilities; they do not establish integration availability in this repository.

## 4. Concrete request walkthrough

Use the application's current configured demo locality; do not mix Indore requests with an Andheri seller map if Claude's location work changes the fixtures. The illustrative names below are fictional. Seed a consistent need date relative to `DEMO_TODAY`, not a permanently hardcoded Friday.

1. Karan opens **My buying needs**, enters “500 grease-resistant pastry boxes by Friday, max ₹6 each; sample first.” Extraction proposes product, quantity, budget, area and deadline. Karan confirms missing size/material information and publishes.
2. The matcher considers three fictional packaging sellers plus deliberately unsuitable decoys. It rejects one seller outside the delivery area, one whose MOQ is 1,000, and one whose earliest delivery is too late. Another seller with stale stock remains **Needs confirmation**.
3. Karan sees up to three currently feasible offers with SKU, unit and total price, delivery commitment, sample policy and confirmation time. The system may return fewer than three; it never fills slots with unqualified sellers.
4. Karan chooses EcoPack and requests a sample. This grants a scoped introduction for this need. Rahul sees the buyer's shared request and business contact preference; private payment signals do not enter the draft.
5. Rahul reviews a short message that references the request and actual sample/price terms. The demo records a simulated message, then a buyer reply through the existing demo mechanism.
6. A sample task is created once. Buyer and seller can confirm the outcome separately. The UI says **Sample requested**, **Seller reports dispatched**, or **Buyer confirms received**, according to actual evidence.
7. If the buyer declines because the sample leaked, record the problem and stop repeat solicitation. If satisfied, record a trial request without inventing payment or marking the whole need fulfilled.

## 5. Data contracts and state machines

The following names describe contracts, not mandated table names. Use Zod validation and reuse compatible models already added by another agent. Model relations and uniqueness explicitly; avoid unrelated free-text IDs where a foreign key can express ownership.

### Merchant context and seller scope

Every need belongs to a buyer merchant. Every offer, hunt, introduction and deal must identify its seller. Resolve acting merchant on the server; do not trust a posted `sellerId` as authorization. For Release A, use a server-validated demo role switcher with an obvious “Viewing as buyer/seller — Demo” label. This is not authentication. Before a real deployment, integrate Paytm's authenticated merchant context and check access on every read/write.

Preserve old single-seller data by an additive migration that assigns the existing known demo seller where unambiguous. Refuse ambiguous backfills. Add `sellerId` to the relevant conversation/deal ownership before enabling multiple sellers: merchantId alone is not a valid duplicate-deal key in a marketplace. An active relation is seller + buyer + need/product context. The same pair uses an existing thread when appropriate; new sellers do not inherit Rahul's conversations or preferences.

### BuyerNeed

Suggested fields: `id`, `buyerMerchantId`, `version`, `status`, `rawInput`, `productKey`, `productSpecJson`, `quantity`, `unit`, `maxUnitPricePaise?`, `neededBy`, `deliveryArea/locationRef`, `sampleRequired`, `supplierIntent` (`NEW`, `BACKUP`, `TRIAL`, `REPLACEMENT`, `UNKNOWN`), `sharingPolicy`, `contactPreferenceRef?`, `provenance`, `createdAt`, `confirmedAt?`, `expiresAt`, `closedAt?`.

- Product specification supports size, material, food-contact requirement and accepted alternatives; distinguish missing from not required.
- Quantity and unit must be compatible with the offer. A box is not interchangeable with a bag; do not silently convert units or substitute product.
- Store money as integer paise and display INR. Budget may be unknown; it is not zero. Quote delivery/tax separately when unknown.
- Store absolute timestamps in UTC, interpret/show deadlines in Asia/Kolkata, and use the domain clock. A deadline and listing expiry are different concepts.
- State: `DRAFT → OPEN → PAUSED | CLOSED | EXPIRED`. Closed has a reason such as bought, cancelled or no longer needed. Sample requested/received are fulfilment milestones, not automatic closure.
- A material edit increments version and invalidates old ready matches. Preserve old snapshots and notify participants of changed terms. A confirmed introduction is not silently transferred to materially different terms.
- Publish requires confirmed product, quantity/unit, area and deadline. Other missing constraints stay visible. A draft from an LLM does not publish itself.

### SupplierOffer

Suggested fields: `id`, `sellerId`, `sku`, `version`, `status`, `productSpecJson`, `unit`, `baseUnitPricePaise`, `tiers`, `moq`, `stockQuantity?`, `stockStatus` (`CONFIRMED`, `UNKNOWN`, `UNAVAILABLE`), `confirmedAt?`, `validUntil?`, `deliveryAreas/radius`, `leadTimeHours`, `deliveryChargePaise?`, `taxPolicy`, `samplePolicy`, `capacityWindow?`, `provenance`.

- Reuse existing offer catalog where possible, with typed additions and validated legacy reads. Existing `inStock: true` defaults do not count as newly confirmed quantity.
- Fixture default: availability expires after 48 hours; make this a configurable pilot choice, not a claimed industry standard. A late-expiring offer never extends beyond its explicit deadline/validity.
- A sample policy includes remaining capacity and contents. Do not promise a free sample when disabled, exhausted or incompatible with the requested SKU.
- Seller confirmation is evidence of a promise, not a stock reservation or proof of delivery. The first release rechecks capacity/stock before contact and commitment. Do not call it “reserved” without a real inventory reservation mechanism.
- Once an introduction is accepted, snapshot the agreed offer. Any subsequent price/quantity/deadline change requires participant confirmation.

### NeedMatch and eligibility

Suggested fields: needId/version, sellerId, offerId/version, `eligibility` (`READY`, `NEEDS_CONFIRMATION`, `EXCLUDED`), typed criterion results, quote snapshot, ranking explanation, evidence references, rankerVersion, evaluatedAt and expiresAt. Unique per need version + offer version.

Each criterion is `PASS`, `FAIL` or `UNKNOWN`. Store the actual compared values and reason. Never infer buyer quantity from QR activity when explicit quantity exists. Unknown critical data prevents a ready match.

### Buyer contact preference and Introduction

Buyer preference: approved product categories, permitted channels, quiet hours, mute/block list, active/revoked status and scope. A request's visibility is not permission for all sellers to send messages.

Introduction: buyerId, sellerId, needId/version, matchId, status (`PROPOSED`, `BUYER_ACCEPTED`, `SELLER_ACCEPTED`, `ACTIVE`, `DECLINED`, `REVOKED`, `EXPIRED`, `CLOSED`), expiry, approved channel, terms snapshot and dedupe key. Buyer acceptance authorizes only the selected seller for the stated purpose. Seller acceptance confirms ability to fulfil and creates or connects the thread. Recheck permission at actual send time, not only draft time.

### Evidence, outcomes and operational cases

Evidence: source kind, source reference, observedAt, expiresAt, visibility (`PRIVATE`, `MATCHING_AGGREGATE`, `SHARED_BUSINESS`), provenance, verified status and extractor version. Identity verification, public reviews, seller assertions and fulfilled delivery history are separate facts.

Extend the existing event model where compatible: idempotency key, actor/seller/buyer context, need/match/introduction/deal references, event type, actual event time and receipt time, payload version, provenance and model/offer version. Index common ownership/time queries.

OutcomeConfirmation: reporter identity/role, related introduction/action/order, outcome, evidence source, time and disputed/confirmed status. A buyer report and seller report coexist. A discrepancy is flagged for follow-up; do not silently choose whichever looks better.

OperationalCase: introduction reference, reason (`NO_RESPONSE`, `MISLEADING_OFFER`, `LATE`, `QUALITY`, `UNWANTED_CONTACT`), reporter, status and resolution notes. Release A may use a local demo operator view; live operations require a real support owner.

## 6. Matching and comparison algorithm

1. Retrieve seller offers by product taxonomy and serviceable geography. Buyer radius can narrow the search; it cannot expand seller delivery coverage.
2. Check product specs, unit, quantity/MOQ, current stock confirmation, delivery deadline/lead time, sample requirement, optional hard budget and contact/mute status.
3. Exclude any hard failure. Place unknown critical values in a separate **Needs confirmation** queue. Allow no hidden promise to pass as an assumption.
4. Calculate a quote for the exact requested quantity: select the applicable quantity tier, extend unit price, then account for delivery/tax if known. Label a partial amount as subtotal, not total. Unknown buyer budget is a disclosure, not rejection.
5. Rank ready offers by the buyer's selected priority: best confirmed price, earliest feasible delivery, sample first or known fulfilment record. Default priority: meets need, then current confirmation, then quoted subtotal, then distance; use a stable tie-breaker. Show the resulting reasons.
6. Display up to three distinct sellers. Multiple SKUs from one seller do not occupy all slots. Retain remaining matches for a buyer-requested refresh.
7. Re-evaluate after need edits, offer edits, expiry, permission changes and seller rejection. Before seller acceptance or sending, repeat the eligibility checks against current versions.

Missing history must not permanently exclude new sellers. If reliability history exists, show the sample count and source; “3 buyer-confirmed deliveries” is a factual statement. Do not invent stars, trust scores or conversion probabilities. Compare new sellers through a trial/sample path.

Suggested pure contract: `evaluateNeedMatch(need, offer, sellerContext, buyerControls, clock) → criteria, eligibility, quote, explanation, evidence`. Keep candidate retrieval separate from the pure evaluator so adapters can change without changing eligibility semantics.

This extends the earlier adaptive plan: explicit seller preferences personalize hunts; explicit buyer priorities personalize need matching. A later learned ranker may reorder eligible matches. It may never override delivery, product, buyer permission or quantity failures.

## 7. Buyer controls and limits

Release A defaults below are proposed configuration, not empirically proven limits:

- At most three initial offer cards per need version; one selected seller gets initial permission to contact. Additional sellers require a new explicit buyer action.
- Prevent quota reset by repeatedly editing or republishing the same need. Count active/recent introductions at buyer/category level too. Pilot default: no more than three new seller introductions per buyer/category in a rolling seven-day window; buyer may explicitly request a documented exception.
- Buyer can block a seller, pause requests, mute a category, revoke permission and report unwanted contact. Revocation stops queued messages and unsolicited follow-ups; retain transaction/support evidence without keeping outreach active.
- Do not auto-contact shortlisted merchants from the seller-hunt path. If category-level permission exists, allow one short qualification question under the same limits. If not, show research status or use an in-app buyer-controlled discovery surface.
- No-reply does not create permission to send reminders. Proposed pilot follow-up: at most one after 48 hours within an active permitted thread, subject to buyer quiet hours and revocation. Transactional updates requested by the buyer have their own explicit purpose; do not disguise promotions as updates.

Enforce the guard in one shared server service used by first-message, manual reply, autopilot, revive and campaign paths. UI-disabled buttons are insufficient. Quota and introduction creation must be atomic with idempotency checks so concurrent requests cannot bypass limits. An excluded seller cannot gain contact simply through an old lead URL.

## 8. Communication, trials and supplier relationships

The first question should reduce a real uncertainty. Examples:

- Inferred bakery fit: “Do you buy pastry boxes locally, and what quantity do you usually need?” Only send through a permitted channel.
- Buyer request: “Karan ji, aapke 500 pastry boxes ke liye ₹5 each ka offer hai. Friday delivery confirm kar sakte hain. Pehle sample dekhna chahenge?” Only claim confirmed price, quantity and deadline; render unknowns as questions.
- Existing supplier: “Aapka regular supplier continue rahe; urgent orders ke liye backup sample try karna chahenge?” Use this angle only when the buyer welcomes a backup or says they already have a supplier.

Drafts use shared need/offer facts and the selected contact role/language. Do not include private payment intelligence, raw KYC details, unsupported “new outlet” claims or blanket best-price/quality guarantees. If contact role is unknown, ask who handles purchasing rather than assert decision authority. If a free sample is unavailable, offer an allowed paid trial or a conversation; do not generate a fake free offer.

Persist draft angle, evidence IDs, need/offer versions, approved text and human approval time. Editing must remain available. Approval of one draft does not authorize future materially different messages. Existing autopilot can handle appropriate replies only within current permission and actual seller terms. Refusal and opt-out stop solicitation; “not now” stores buyer timing without automatic resumption outside permission.

Sample flow: `REQUESTED → SELLER_CONFIRMED → DISPATCH_REPORTED → BUYER_RECEIVED → FEEDBACK_RECORDED`, with `CANCELLED`, `FAILED` and `DISPUTED` branches. A provider webhook establishes only what its documented event proves. Make reference IDs and task creation idempotent; no duplicate sample from webhook retry or repeated clicks.

## 9. Low-effort input and freshness

P0 input: short text/form plus existing voice transcription only where already supported. Ask for product, quantity, area and deadline; confirm extracted facts before publish. Seller catalog can be reused, then prompt “Still available at these terms?” Inline edit preserves the remaining input on errors.

P1 input: catalog photo extraction and POS imports. Treat extraction/import as a draft with source and confidence. Do not add a new paid vision dependency as a prerequisite for Release A. An uncertain product dimension, unit, price or stock value requires confirmation. A source becoming stale triggers reconfirmation; it must not erase prior agreed terms.

A recurring need is suggested only from buyer-confirmed cadence (“Every month on the fifth”) with a prior quote. Ask the buyer whether to create a reminder; do not republish a purchase request or introduce new sellers automatically. POS-based stock signals, if later approved, remain a separate adapter with merchant-specific permission and coverage.

## 10. APIs, services and UI seams

These are proposed routes; align naming with the existing API envelope and avoid duplicates if another agent added them. All mutation routes need existing request guards, bounded payloads, strict schemas, ownership checks and actionable errors. Use 409 for stale versions, eligibility changes and duplicate conflicts where appropriate. All listed states must survive refresh.

| Capability | Suggested API | Main behavior |
|---|---|---|
| Parse draft need | `POST /api/vyapar/needs/preview` | Extract draft; does not publish or share |
| Publish/list | `POST/GET /api/vyapar/needs` | Confirm inputs; buyer-owned list or permitted seller view |
| Edit/pause/close | `PATCH /api/vyapar/needs/[id]` | Expected version; material edits invalidate ready matches |
| Match offers | `POST /api/vyapar/needs/[id]/match` | Return ready/confirmation/excluded counts and real reasons |
| Confirm offer | `PATCH /api/vyapar/offers/[id]` | Expected version; terms and freshness; uses seller context |
| Propose/accept introduction | `POST /api/vyapar/introductions`, `PATCH /api/vyapar/introductions/[id]` | Scope, quota, buyer selection, seller acceptance and dedupe |
| Manage permission | `PATCH /api/vyapar/buyer-controls` | Revoke/mute/block and cancel prohibited queued messages |
| Report outcome/problem | `POST /api/vyapar/introductions/[id]/outcomes`, `/report` | Reporter-scoped, immutable evidence and idempotency |
| Pilot funnel | `GET /api/vyapar/pilot/metrics` | Provenance-filtered counts and denominator definitions |

Suggested services: `needs.ts`, `offers.ts`, `matching.ts`, `introductions.ts`, `permissions.ts`, `outcomes.ts`. Reuse existing opportunity/event modules if compatible. Run AI/network calls outside short transactions. Persist publication, quota and message state transitions in short version-checked transactions.

Messaging boundary: create an approved outbound record with `SIMULATED` or `PENDING_DELIVERY`, then call an adapter. Mark `DELIVERED` only from a verified delivery event. A successful queue acknowledgement can mean accepted, not delivered. For live Release B, use an idempotent outbox/retry worker and a signed provider callback; failure retains the reviewed draft and avoids a duplicate contact. Offline demo uses its own labelled adapter and never calls real numbers.

UI additions:

- **My buying needs:** draft/open/paused/expired list, compact text entry, confirmation card and buyer controls.
- **Need detail:** comparable offers, unknowns, terms, sample policy and buyer-selected introduction.
- **Seller opportunities:** requests Rahul can fulfil, unknowns to confirm and excluded explanations; connect accepted introduction to existing composer/thread.
- **Existing lead cards:** demand status (`Inferred`, `Buyer confirmed`, `Unknown`), source and contact readiness.
- **Existing offers screen:** availability confirmation and versioned terms; coordinate with T116 rather than build two editors.
- **Existing thread:** permission status, agreed terms, sample milestones, simple received/quality feedback and report issue.

Keep mobile layouts and keyboard access. Do not present an operator-only model label, internal quota key or raw JSON in a buyer flow. Demo role switching should clearly explain that both sides are simulated.

## 11. Outcome metrics and future learning

Log the full funnel with consistent IDs and timestamps: need drafted, published, match evaluated, offer shown, buyer selected, seller accepted, message approved, sent/queued, delivered, meaningful reply, sample requested, sample buyer-received, trial requested, order reported and payment verified. Store simulated/real provenance on every event independently of whether an LLM was live.

| Metric | Definition |
|---|---|
| Confirmed-demand coverage | Suggested seller-hunt candidates with explicit current buyer need / evaluated candidates; report inferred candidates separately |
| Feasibility rate | Ready matches / evaluated offers, plus needs having at least one ready match / open needs |
| Introduction acceptance | Buyer-selected / shown eligible introductions, and seller-accepted / buyer-selected; do not merge sides |
| Meaningful reply rate | Delivered first contacts receiving a relevant positive/qualification response within seven days / delivered contacts whose seven-day window has closed |
| Sample fulfilment | Buyer-confirmed received / seller-confirmed sample tasks whose deadline has passed |
| Complaint rate | Unique reported introductions / active introductions in the same cohort |
| Offer freshness | Ready offers with unexpired confirmation / displayed ready offers; should be 100% by definition |
| Outcome ascertainment | Introductions with a source-labelled confirmed/reported outcome / introductions old enough for follow-up |

Show counts alongside rates, pending windows separately, and real/demo cohorts separately. Deduplicate retries. A seller's order report, buyer confirmation and verified payment have different certainty. Payment must map to the relevant order; a nearby unrelated payment does not prove conversion. Without actual order quantity and price, existing `estimateValue()` is an estimated pipeline value, not realized revenue.

Use explicit save/skip feedback for preference adaptation now. Future training must use real merchant outcomes with timestamped feature snapshots, delayed labels and exposure logs. Measure model performance against the current rules on later-time holdouts and by seller; avoid repeated conversations leaking across splits. Message variant learning is a separate task from buyer ranking. A few scripted sample replies do not establish conversion lift. Controlled exploration, logistic/tree ranking and propensity logging remain in Release C from the earlier brief.

## 12. Pilot and economic test

Proposed pilot: one locality, packaging suppliers and bakeries/cafes, approximately 5–10 sellers and 20–30 consenting buyers over four weeks. These numbers are a manageable discovery cohort, not proof of statistical power or sufficient ML data. Keep a human operator available to investigate missing stock and complaints.

- Week 1: validate product specifications, recurring needs, seller stock and willingness to receive offers. Record why buyers decline.
- Week 2: enable limited introductions and samples; audit whether the match was genuinely feasible and the first message appropriate.
- Weeks 3–4: track fulfilled trials and repeat requests, outcome ascertainment, support effort and willingness to pay. Compare with each merchant's prior workflow through interviews; do not call observational improvement causal lift.
- Costs: operator minutes per introduction, sample subsidy, actual channel cost, provider/model spend and dispute effort.
- Value: buyer/seller-reported useful conversations, confirmed orders and repeat use. Later controlled rollout is needed to claim incremental retention or orders.

Do not make live roll-out depend on arbitrary invented success thresholds. Before the pilot, record agreed thresholds and stop conditions with the operator/product owner. Investigate repeated unwanted contact, materially misleading offers or fulfilment failures immediately. Test monetization only after usefulness: optional seller subscription or fee for a buyer-accepted qualified introduction. Do not charge for guessed demand or label a cold lead “qualified.”

## 13. Bounded implementation cycles

Use identifiers B01–B10 here as planning labels; inspect `TASKS.md` and allocate available task IDs before implementation. Do not mark these implemented from this document. Reconcile work already in progress on preferences/opportunity snapshots; no duplicate schema/module.

| Cycle | Dependency | Deliverable | Completion gate |
|---|---|---|---|
| B01: domain and scope | Current Vyapar build | Need/offer/permission/match schemas, additive migration, seller-scoped context and fixtures | Legacy data readable; two sellers cannot read or alter each other's threads/preferences; no reset of production data |
| B02: buyer request | B01 | Preview/confirm/publish, list/detail, edit/pause/expiry | Invalid/missing fields retained; explicit publish; material edits increment version; unknown stays unknown |
| B03: offer freshness | B01; coordinate T116 | Structured price/MOQ/quantity/deadline/sample and confirmation UI | Correct tier quote, paise, freshness and seller ownership; unavailable sample never promised |
| B04: feasibility matching | B02+B03 | Pure evaluator, ready/unknown/excluded queues and comparable offers | All hard filters and deadline boundaries pass; maximum three distinct eligible sellers; stable tie order |
| B05: controlled introductions | B04 | Buyer acceptance, seller acceptance, mute/revoke and quotas | Atomic cap/dedupe; send-time permission recheck; active thread reused by correct pair/context |
| B06: grounded conversation | B05 | Composer/thread hookup and one-question qualification | Claims trace to shared facts; first-message approval; existing autopilot/revive cannot bypass controls |
| B07: samples and feedback | B06 | Sample milestones, buyer/seller confirmation and issue reporting | Duplicate request/webhook creates one action; received/report/dispute labels accurately reflect evidence |
| B08: observability | B05–B07 | Idempotent event log, metrics and demo operator view | Delayed denominators correct; simulated events excluded from real metrics/training; no inferred paid orders |
| B09: demo integration | B08 | Two role demo, locality-consistent fixtures, reset, failure recovery, visual/keyboard QA | New path and original V7 both work offline twice; caches preserved and no baseline data discarded |
| B10: live pilot adapters | B09 + actual partner/channel authorization | Paytm merchant identity/data adapters, messaging delivery and support process | Documented data scope, signed/idempotent callbacks, verified delivery and operational owner; blocked when unavailable |

After each cycle run the appropriate isolated tests, TypeScript and required repository checks; run the protected verification gate before declaring the integrated release complete. Do not download dependencies, mutate external production data or invoke paid services just to make deterministic tests pass. Preserve Claude's current design and directory changes.

## 14. Meaningful test matrix

Use unit tests for pure eligibility/quote logic, isolated DB tests for state/concurrency, and finite UI/API golden-path checks for integration. Test behavior and invariants rather than restating implementation.

- **Quote:** correct tier at 499/500/1,000; buyer budget unknown; delivery fee/tax unknown; no unit conversion; paise precision and quantity limits.
- **Deadline:** before/equal/after seller earliest delivery; expired stock; UTC/IST date rollover; frozen demo date; changed cutoff.
- **Isolation:** two sellers sharing a buyer still have distinct offers, permissions and deal ownership; forged seller/buyer IDs rejected.
- **Matching:** insufficient stock, incompatible dimensions/material, high MOQ, wrong locality, muted seller, stale versions and unknown contact cannot become ready contact.
- **Permission:** simultaneous accepts do not exceed caps; edits/republication do not reset quota; revocation stops queued/manual/autopilot/campaign/revive sends; retries do not reserve additional slots.
- **Messaging:** simulated sends never recorded as real delivery; queued failure keeps reviewed text; callback retry/out-of-order event does not duplicate delivery or regress state.
- **Fulfilment:** seller-dispatched versus buyer-received separated; sample exhausted; conflicting outcome reports; repeated action/webhook stays idempotent.
- **Evidence:** public place listing plus fictional need remains demo; payment trend never becomes a new outlet/SKU need; private signal never enters buyer draft.
- **Metrics:** pending contacts not counted as negative replies; events deduped; reported orders not verified payments; real and demo cohorts isolated.
- **Recovery/UI:** failed parse keeps raw input; stale offer shows reconfirm action; revoked contact explains reason; readable comparison at mobile width, keyboard focus and honest empty state.

## 15. Demo fixtures and acceptance scenario

Create fixture files under `demo/` or the established `data/` convention with explicit demo provenance. Retain existing seeds and caches. Use separate namespaced fixtures, and reset them through the existing controlled reset service.

Fixtures: one fictional buyer need, three feasible sellers with meaningfully different price/delivery/sample terms, four decoys (wrong product, MOQ conflict, deadline conflict, stale stock), one existing-supplier buyer, one muted buyer, and one recurring purchase statement. Seed only enough seller profiles to exercise multi-seller isolation and the comparator.

Demo (about three minutes): buyer posts a request → confirms parsed facts → sees suitable offers and one excluded reason → selects sample from EcoPack → seller confirms ability and reviews a grounded draft → simulated buyer requests the sample → buyer confirms received in demo → outcome appears with provenance. A second short check revokes permission and visibly stops a follow-up. Keep the original V7 hero path as a separate regression; do not force a new request onto every existing seeded deal.

Release A is complete when every B01–B09 gate has evidence, the failure paths above are covered, and a reviewer can distinguish demand confirmation, seller assertion, simulated communication and fulfilled outcome. A live LLM output does not turn fictional buyer data or local messages into live commerce.

## 16. Claude kickoff instruction

Implement this plan incrementally in the existing Vyapar application. Read the latest files and inspect dirty changes before editing; another agent is actively extending the domain. First reconcile this plan with `PRODUCT_SPEC.md` and register the bounded work in `TASKS.md`. Start with B01, reusing any compatible opportunity/preference/event additions already present. Preserve the original demo and all valid unfinished work. Use server-resolved merchant context, typed contracts, explicit unknowns, versioned snapshots and honest provenance. After each cycle verify the relevant acceptance gates and update the handoff. Continue through B09 under the repository workflow; report B10's actual external dependencies rather than pretending they are available. Do not commit or push.
