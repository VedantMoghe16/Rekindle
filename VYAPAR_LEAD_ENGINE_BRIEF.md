# Vyapar AI: adaptive merchant lead and conversation engine

**Status:** Proposal for Claude to implement, 3 October 2026. No adaptive model or new Paytm data connector is implemented by this document. The current product authority is `PRODUCT_SPEC.md` V1–V7; preserve its golden demo, demo labels, and human approval of the first message. This brief refines the Vyapar lead-generation path at the product owner's request. If a requirement conflicts with the spec, surface the conflict and update the product spec with the owner rather than silently changing it.

## The problem to solve

A fixed score can sort merchants, but it cannot learn that Rahul's paper bags sell especially well to bakeries that need small orders, while another packaging seller succeeds with high-volume cloud kitchens. A payment increase also does not prove that a bakery needs paper bags. Vyapar should answer four questions for every suggested lead:

1. **Can this seller fulfil a plausible need?** Match the actual product, price, minimum order, stock/sample availability and delivery radius to the buyer's business.
2. **Why is now a useful moment?** Show a dated, sourced signal or say timing is unknown.
3. **Who can we responsibly approach?** Identify a verified business contact or state that the contact is unknown. An owner name alone does not prove decision authority or WhatsApp reachability.
4. **What should the first conversation say?** Ground one short ask in buyer evidence and a seller capability, then learn from the response.

The distinctive unit is an **opportunity hypothesis**, not a score: “This buyer may need X because of evidence Y; this seller can offer Z; try action A; confidence and source are visible.” A high score never substitutes for a missing contact, unavailable stock or impossible delivery.

## What data can actually support this?

Paytm publicly describes business profiles, payment/settlement reports and analytics, while its Billing POS offers catalog, inventory and product-level sales reports. These are different products and access paths. The public material does **not** establish that this prototype can query another merchant's private transactions, catalog, KYC phone number or owner role. An internal Paytm deployment could negotiate specific, permitted data products; until then use fictional fixtures and label them `Demo data`.

| Input | Possible origin | Safe claim in a lead card | Do not claim |
|---|---|---|---|
| Business category and trading area | Paytm merchant profile/MCC, if an approved internal feed exists | “Registered bakery in Scheme 54” | Specific product need from MCC alone |
| Payment activity | Authorized, aggregated Paytm merchant metrics | “QR receipts rose versus the merchant's own prior period” | “Buying packaging now” or exact business revenue |
| New location | Verified second outlet/location record, or public buyer-controlled announcement | “New payment location recorded” or “Second outlet announced,” according to source | “Opened a new bakery” from one new MID alone |
| Catalog, stock, product mix | Seller-entered offers; buyer POS data only if that merchant uses POS and access is approved | “Seller has pastry boxes in stock”; “Buyer lists pastries” when sourced | SKU inference from QR payments |
| Reviews/menu/posts | Permitted public/partner source with URL and observation time | Exact dated statement from the source | Current packaging material or purchase intent without evidence |
| Contact and channel | Buyer-merchant opted-in business contact and channel preference, or approved directory | “Business contact: Karan; WhatsApp permitted” | Using a KYC/private phone or guessing the owner is the purchaser |
| Reply and outcome | In-app demo reply or actual integrated channel event | “Buyer asked for a sample” with message evidence | Delivery, reply or order from an internally created chat record alone |

The key honesty rule: **signal → hypothesis**, never signal → asserted need. A transaction spike means “business activity changed.” A new outlet with a menu or POS category can support a packaging hypothesis. The buyer's own reply is the strongest need evidence.

Sources: [Paytm for Business dashboard](https://business.paytm.com/), [merchant analytics](https://business.paytm.com/payment-analytics), [Billing POS catalog/inventory/product reports](https://business.paytm.com/pos-billing-software), [QR merchant dashboard](https://business.paytm.com/retail), [payment webhooks and their scope](https://business.paytm.com/docs/callback-and-webhook/), [Paytm privacy statement](https://paytm.com/company/privacy-policy). These establish product capabilities, not this app's entitlement to cross-merchant data.

## Target experience: one lead, end to end

Rahul says: “I sell pastry boxes and paper bags from ₹5, can deliver within 5 km, and can send a free sample this week.” Vyapar forms a seller offer profile from his input and asks him to confirm factual capabilities. The system retrieves eligible merchants, then evaluates each **seller–buyer–offer** combination, rather than scoring the buyer in isolation.

For Karan's Cafe, the card should contain:

- **Opportunity:** “Pastry-box sample for the new outlet” only if the outlet source is verified; otherwise “Pastry-box sample for a nearby bakery.”
- **Why this merchant:** category, distance and relevant product/menu evidence.
- **Why now:** dated new-outlet or activity signal, with provenance; show “Timing unknown” if absent.
- **Can Rahul serve them:** matching SKU, price, stock/sample availability, minimum order and delivery range.
- **Contact:** named permitted business contact with role and channel, or “Contact not verified—ask for an introduction.”
- **First message:** short Hinglish draft with one claim, one offer and one question. It must not reveal private payment intelligence (“We noticed your transactions rose”) to the buyer.
- **Feedback:** save/skip/reason; draft edited/approved; actual send status; reply, sample, meeting and order separately.

After Karan replies, “Price is high; I need 1,000 bags monthly,” save the quote and quantity. If Rahul adds a ₹4.20 tier, re-evaluate the **same opportunity** and show exactly what changed. This connects acquisition to the existing objection memory/revival loop.

## Ranking architecture: adapt without pretending to have trained data

Use four layers, in this order:

### 1. Eligibility gates

Reject or hold candidates with incompatible product category, outside delivery range, seller's minimum order/stock conflict, existing active deal, explicit rejection/opt-out, or unsupported contact channel. An unknown fact is `UNKNOWN`, not `PASS`; it may trigger a seller clarification or research action. Never let a learned model override a hard gate.

### 2. Evidence-backed opportunity features

For every seller–buyer–offer pair compute typed features with missingness flags: product/category compatibility, distance versus delivery radius, price and MOQ compatibility, seller's available sample, buyer capacity *band* if permitted, signal type/age/reliability, buyer-stated needs, contact permission and prior relationship. Keep provenance, observation time, TTL, and whether evidence is demo, public, permitted internal, computed or buyer-stated. Do not use raw transaction values or private personal identifiers as model features.

Do not add “evidence quality points” as if more web reviews directly mean more likelihood to buy. Use source quality to determine **confidence** and what claims can be made. Show estimated relevance and confidence separately. Prevent future-dated or stale signals from influencing “why now.”

### 3. Cold-start personalization, available for the demo

No genuine outcome dataset exists in this repository. Keep a transparent base ranking for new sellers, then immediately personalize from **explicit seller choices**: catalog, target categories, delivery radius, MOQ, price bands, preferred language, rejected lead reasons and saved leads. A rejection such as “too far,” “only buys in bulk,” or “I cannot make this SKU” should update that seller's filters/preferences and re-rank the current hunt. Store the preference change, show why the list moved, and let the seller undo it. This is real personalization without claiming model training.

Add one useful clarification when it changes the shortlist: “Can you deliver 1,000 pastry boxes to Nipania this week?” Its answer updates eligibility. Avoid a long onboarding questionnaire.

### 4. Learned ranking after real outcomes exist

Instrument the decision log now; train later on **real, authorized** outcomes. Start with a small regularized model over interpretable pair features (for example logistic regression or a tree model) predicting a **meaningful buyer response** among *actually contacted, deliverable* opportunities. Pool learning across similar seller product categories; add seller-specific adjustments only where that seller has sufficient verified observations. Keep a frozen rules fallback and a model version. Never train on fictional seed outcomes or user clicks as if they were purchases.

Treat displayed, saved, contacted, delivered, replied, positive reply, sample requested and order won as **different events**. The primary learning target should be a positive buyer reply or sample/meeting request within a defined window after a verified delivery; order is a later metric. “No reply” becomes an outcome only after the window closes. A demo chat record is `simulated`, not a delivered message.

Evaluate on a later-in-time holdout and group by seller so repeated leads/messages do not leak across train and test. Compare to the fixed ranker on top-five precision, positive-reply rate per verified contact, and unsupported-claim rate. Log all eligible candidates shown, their position, the chosen action and model/rule version; otherwise contacted-only feedback produces selection bias. A contextual bandit or controlled exploration is a later option once there is genuine traffic, safe candidates and logged selection probabilities. It is **not** needed for the hackathon demo. The general basis for contextual learning and unbiased replay is [Li et al., WWW 2010](https://www.microsoft.com/en-us/research/publication/a-contextual-bandit-approach-to-personalized-news-article-recommendation-3/) and [Li et al., offline evaluation](https://arxiv.org/abs/1003.5956); these papers motivate the future design, not a claim that Vyapar has implemented it.

## Conversation strategy

Choose the first conversation by **purpose**, then draft:

- Strong buyer-stated need → answer that need and offer a specific next step.
- Verified expansion or relevant menu/product change → congratulate or acknowledge the public event, connect one seller capability, ask about a sample.
- Category fit but no timing evidence → introduce the seller nearby and offer a low-commitment sample; do not invent urgency.
- Missing or uncertain decision contact → propose an introduction request or in-person visit, not a fabricated WhatsApp recipient.

Ground every claim in a permitted source and a real seller offer. Keep the existing editable, human-approved first message. Track which angle the seller selected/edited and what the buyer actually said. Use reply memory to choose the next play; do not infer that the draft worked merely because the seller clicked Send.

## Implementation plan for Claude

Follow `AI_WORKFLOW.md`, inspect the current dirty tree, preserve the other agent's work, and execute one bounded task per cycle. This document is a target plan; `PRODUCT_SPEC.md` remains authoritative. The current entry points are `src/lib/vyapar/scoring.ts`, `src/lib/vyapar/server/hunts.ts`, `src/lib/vyapar/server/pitches.ts`, `src/lib/vyapar/pitch.ts`, `src/lib/vyapar/server/conversation.ts`, `src/components/vyapar/lead-list.tsx`, and the Merchant/Vyapar models in `prisma/schema.prisma`. Existing code already has a five-part **fixed** score and fictional merchant signals; no real adaptive model is present.

1. **First bounded cycle — opportunity contract and truthful ranking.** Add a typed opportunity/evidence object and seller-offer eligibility checks. Keep the current hunt and demo working. Rank eligible seller–buyer–offer pairs; show separate relevance, timing and confidence, plus a source-backed reason and any unknowns. Preserve old `reasonsJson` reads. Do not call a rules output “ML.” Add tests for missing signal, stale/future signal, incompatible MOQ/delivery, existing deal, and demo provenance.
2. **Second cycle — seller preference feedback.** Add save/skip reason and one clarification answer; persist per-seller preferences, re-rank deterministically and explain the change. Cover undo/reset and avoid rewriting historical hunt scores silently. Use only explicit seller feedback in the demo.
3. **Third cycle — grounded communication.** Select a conversation angle from verified opportunity facts; validate that the draft contains no unsupported buyer claims or private payment details. Show contact verification/channel status. Continue human approval. Test a strong signal, no signal, unknown contact and edited seller offer.
4. **Fourth cycle — outcome logging and future model interface.** Record exposure, seller action, message delivery provenance, reply and downstream outcomes with stable IDs and timestamps. Define a versioned ranker interface (`rules` now, `learned` later) and a report of real-label coverage. Do not fit a model or display predictive conversion percentages without sufficient real outcome data and an evaluation run.

For every cycle: update `TASKS.md` and `handoffs/server.md`, run the relevant tests/typecheck/build, and preserve the existing three-minute Vyapar golden path. No commits or pushes; the supervisor owns Git mutations.

## Three-minute demo addition

Use the existing fictional Indore merchants and visible `Demo data` badges. On Rahul's hunt, show Karan's opportunity card with the actual source of each claim and one unknown fact. Have Rahul answer the one clarification or mark a lead “Cannot supply this quantity”; the list re-ranks immediately and explains why. Open Karan's draft, show the one evidence-backed hook and sample ask, edit it, and simulate the reply as the existing demo does. Then change the offer tier and show the old price objection re-entering the shortlist. This demonstrates adaptation through **seller feedback and buyer memory**, while model training remains a clearly labelled future capability.

## Acceptance and non-claims

- The top-five list contains only eligible, deliverable opportunities; excluded/unknown cases have specific reasons.
- Every “why now” and buyer-specific pitch claim opens to a dated source or explicitly says `Demo data`/`Buyer said`/`Unknown`.
- A payment trend is never represented as a known SKU need, new outlet or contact permission.
- Seller feedback changes that seller's recommendations and can be undone; one seller's preferences do not silently change another seller's list.
- Duplicate hunts do not create duplicate active deals or duplicate send outcomes.
- No private KYC contact detail or raw buyer transaction history appears in a seller-facing card or pitch.
- No label says “trained,” “predicted conversion,” “live Paytm insight,” “WhatsApp delivered,” or “learned from outcomes” unless the corresponding data, integration and evaluation exist.
- The offline golden demo works twice after reset. The acceptance report distinguishes fixture-backed behavior from any live Paytm integration or real-buyer result.

**Open integration dependency:** Paytm would need to specify which cross-merchant fields, derived signals and business contact routes this product may actually use. Until that contract exists, build adapter interfaces and use clearly fictional fixtures. This dependency does not block the truthful, personalized demo described above.
