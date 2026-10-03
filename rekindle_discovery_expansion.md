# Rekindle Discovery — product expansion

Status: active product direction, 3 October 2026. D0 is implemented on evidence-backed fictional demo data. This extends the existing Rekindle product from stalled-deal revival into a complete evidence-led sales workflow.

## Product idea

Rekindle should help a founder or salesperson move through one continuous loop:

**Describe product → define ideal customer → discover accounts → inspect evidence → approve outreach → capture replies → remember objections → monitor changes → revive at the right moment.**

The conversational prospecting pattern is inspired by Origami: a user describes the customer they want in plain English and refines a researched lead table through follow-up prompts. Rekindle's differentiation is the memory after discovery. The system preserves why each account was selected, what was said in every conversation, why an opportunity stalled, and which later event makes the account actionable again.

## The first-run experience

The product opens with a chat called **Find accounts**. Rekindle asks only for information that materially changes research:

1. What do you sell? A website can prefill this, but the user reviews it.
2. Which customer gets the most value?
3. Who feels the problem and who can approve the purchase?
4. Which geographies, company sizes, industries or technologies matter?
5. What buying signals should make an account interesting now?
6. Which accounts should be excluded?

A useful first prompt can be loose:

> We automate SOC 2 and ISO 27001 for Indian SaaS companies. Find Series A–C companies with 50–500 employees that sell to enterprises and are hiring security, platform or compliance roles. Target CTOs and Heads of Security.

Rekindle turns that into a visible, editable research plan:

- Company filters: India, SaaS/fintech/healthtech, 50–500 employees, Series A–C.
- Problem hypotheses: enterprise compliance pressure, small security team, upcoming audit.
- Relevant signals: security/compliance hiring, enterprise launch, funding, ISO/SOC content, cloud infrastructure hiring.
- Personas: CTO, VP Engineering, Head of Security, Compliance Head.
- Exclusions: agencies, consultancies, current customers, companies without supporting evidence.

The user approves the plan before research begins. Results appear incrementally in a table while the chat remains available for refinements such as “only Bengaluru and Mumbai,” “show companies with a new security leader,” or “explain why these three scored highest.”

## Lead result contract

Every candidate needs evidence. A candidate is an account until a suitable public business contact is identified.

| Field | Meaning |
|---|---|
| Account | Company name, domain, industry, location and estimated size |
| Fit score | Match to explicit ICP criteria, 0–100 |
| Timing score | Strength and freshness of relevant buying signals, 0–100 |
| Overall score | `0.6 × fit + 0.4 × timing` for the first version |
| Why it fits | Two or three criteria with cited public evidence |
| Why now | One or more dated signals with source links |
| Suggested persona | Role to approach; a named person only when supported by an allowed public source |
| Confidence | High, medium or low based on evidence coverage and source agreement |
| Status | Suggested, shortlisted, researching, ready, contacted, replied, qualified, stalled, revived or disqualified |

The system should show “Unknown” when evidence is missing. It should never infer an email address, headcount, funding event or technology without a source.

## Product navigation

The primary navigation becomes:

1. **Find accounts** — conversational product/ICP definition and lead research.
2. **Leads** — evidence-backed candidate table and shortlist.
3. **Today** — outreach, follow-up and revival recommendations ranked together.
4. **Conversations** — capture email, WhatsApp, call and meeting content.
5. **Accounts** — full relationship memory and graph for each company.
6. **Insights & Campaigns** — aggregate objections and marketing assets.
7. **Revenue Loop** — outcomes and learning.

For an empty workspace, Find accounts is the home page. For an established workspace, Today remains the home page and “Find more accounts” is a primary action.

## Unified account lifecycle

```text
SUGGESTED → SHORTLISTED → READY → CONTACTED → REPLIED → QUALIFIED
                                              ↓             ↓
                                         DISQUALIFIED    STALLED
                                                            ↓
                                        signal removes blocker
                                                            ↓
                                                         REVIVED
```

Lead status and deal lane serve different purposes. Status describes the relationship stage. `REVIVE / WARM / WATCH` describes what Rekindle recommends today. A stalled account can move between those lanes without rewriting its history.

## Knowledge model

The knowledge graph should make recommendations explainable. It should model facts and relationships with provenance instead of storing an opaque LLM summary.

### Core nodes

- Seller, Product, Capability and Proof Point
- ICP Segment and Qualification Criterion
- Account and Person/Role
- Need, Use Case and Buying Trigger
- Interaction, Claim, Commitment and Objection
- Signal, Deal, Recommendation, Campaign and Outcome

### Important edges

- Product `SOLVES` Need
- Proof Point `SUPPORTS` Claim
- ICP Segment `REQUIRES` Criterion
- Account `MATCHES` Criterion
- Evidence `SUPPORTS` Match
- Person/Role `WORKS_AT` Account
- Interaction `MENTIONS` Need or Objection
- Objection `BLOCKS` Deal
- Signal `WEAKENS` or `REMOVES` Objection
- Campaign `ADDRESSES` Objection
- Outcome `VALIDATES` or `CHALLENGES` a targeting hypothesis

Every extracted edge carries `source`, `sourceUrl or interactionId`, `observedAt`, `confidence`, `extractorVersion`, and optional `validFrom/validTo`. This lets the UI answer “why is this here?” and lets newer evidence supersede stale facts without deleting history.

Do not introduce a graph database for the first version. The current relational store can represent typed nodes, typed edges and evidence records, while product queries remain simple and testable. Move to PostgreSQL with vector search when multi-workspace scale, semantic retrieval or graph traversal becomes a measured constraint. A graph visualization is a view of trusted records, not the primary storage decision.

## Proposed data additions

- `DiscoveryThread`: workspace chat and current research state.
- `ChatMessage`: user/assistant/tool message with references.
- `ProductProfile`: reviewed product, capabilities, proof points and exclusions.
- `IcpVersion`: versioned natural-language definition plus structured criteria.
- `ResearchRun`: approved query plan, sources, progress and cost.
- `LeadCandidate`: account, scores, confidence, stage and qualification state.
- `LeadCriterionResult`: pass/fail/unknown with evidence.
- `LeadEvidence`: source URL, excerpt, observed date and provenance.
- `GraphNode`, `GraphEdge`: typed derived knowledge with evidence pointers.
- `OutreachThread`: approved draft, channel and external send status.

The existing `Account`, `Interaction`, `Memory`, `Signal`, `Deal`, `Recommendation` and `Outcome` records continue after a candidate is shortlisted. Promotion from candidate to account is explicit and idempotent.

## Intelligence pipeline

1. **Product understanding:** extract a proposed product profile from chat or website text; user approves facts and proof points.
2. **ICP compilation:** convert conversational requirements into typed criteria and search strategies.
3. **Research:** query allowed public sources through source-specific adapters and retain raw evidence.
4. **Entity resolution:** normalize domains and company names, then merge duplicates conservatively.
5. **Qualification:** apply deterministic criterion checks first; use an LLM only to interpret unstructured evidence. Unknown remains unknown.
6. **Ranking:** calculate fit, timing and confidence separately so a user can distinguish a perfect-fit account from a merely active one.
7. **Persona selection:** recommend a role from the need and buying process; enrich a named public contact only when configured.
8. **Outreach draft:** write from the approved product proof and candidate evidence. One claim, one reason now, one ask.
9. **Conversation memory:** ingest replies and calls into the existing Revenue Memory pipeline.
10. **Learning:** compare criteria and signals with replies, meetings and wins; propose ICP changes for user approval.

## Source strategy

Start with sources that are reliable, permitted and useful for company-level discovery:

- Company websites and public about/product/security/careers pages
- Greenhouse and Lever job boards
- Public funding and company news feeds
- User-provided CSV lists
- Configured company directories or data-provider APIs

Each adapter declares its terms, rate limit, cache duration and available evidence types. Personal contact enrichment is a separate connector with its own authorization and provenance. Rekindle should not scrape private profiles or guess personal contact data.

## Human control

- The user approves the product profile and ICP before a research run.
- The user shortlists accounts before contact research or outreach drafting.
- Rekindle drafts messages but never sends without a separate explicit action.
- Every lead, score and message shows the evidence it used.
- Demo, cached, inferred and simulated information remains visibly labelled.

## Revised build order

### D0 — Discovery experience on demo data

**Implemented.**

- Add Find accounts and Leads routes.
- Build chat, product-profile review, research-plan review and incremental-looking result UI driven by actual local steps.
- Seed 12 fictional candidate accounts with evidence and three confidence levels.
- Promote a shortlisted candidate into the existing Account Brain.

Acceptance: the CloudKavach prompt returns a ranked, cited demo lead table; a follow-up prompt changes the structured criteria and results; promoting a lead creates one account with retained evidence.

### D1 — Conversational compiler

- Add versioned Product Profile and ICP schemas.
- Implement structured LLM calls, cache/offline fallbacks and clarification policy.
- Show the exact plan and criteria before research.

Acceptance: vague input becomes a reviewable plan, corrections create a new version, and no unapproved product claim enters outreach.

### D2 — Real company research

- Build company-site, Greenhouse and Lever adapters.
- Add source cache, rate limits, dedupe and entity resolution.
- Implement criterion evidence and fit/timing/confidence scoring.

Acceptance: at least one real research run produces source-linked accounts; disconnecting the network shows cached results honestly.

### D3 — Shortlist and outreach workspace

- Add persona recommendations, research-on-demand and editable outreach drafts.
- Record manual sent/contacted/replied transitions without pretending to send.
- Route captured replies into Revenue Memory.

Acceptance: a researched candidate can move through shortlist, approved draft, manual contacted state and a captured response without losing provenance.

### D4 — Evidence graph and account reasoning

- Materialize trusted nodes and edges from product, research and conversations.
- Add an Account Brain graph view and graph-backed “why this lead / why now / what changed” answers.
- Add temporal invalidation and conflict handling.

Acceptance: every displayed graph edge opens its supporting source; conflicting facts remain visible and ranked rather than silently overwritten.

### D5 — Closed-loop learning

- Aggregate outcomes by ICP criterion, signal, persona and message angle.
- Suggest changes to qualification weights or targeting rules for approval.

Acceptance: the system explains which evidence patterns correlate with replies and meetings and never changes targeting autonomously.

## Scope boundary for the next build

Build D0 and D1 before expanding live source coverage. This validates the user experience, data contracts and promotion into the current Rekindle pipeline. The first version should find good accounts and explain them; broad contact databases, automatic sequencing and a specialized graph database can wait for evidence that they improve the core loop.
