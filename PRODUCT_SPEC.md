# Rekindle — Product Spec (Hackathon Build)

> **Rekindle** is an AI revenue teammate for B2B sales teams. It remembers *why* every deal stalled, watches for the moment that reason stops being true, warms cold accounts with marketing built from their real objections, and tells sales exactly who to contact today, with the evidence and a ready-to-send message.

This document is the single source of truth for the build. It is written for **Claude Code** to execute, and for the team to review.

---

## 0. How to use this document (instructions for Claude Code)

1. **Build in the order given in §15 (Build Plan).** After every milestone the app must still run and the demo path must still work. Never leave `main` broken.
2. **The golden demo path (§4) is the product.** Anything that doesn't make the demo better, more reliable, or more believable is lower priority.
3. **Make reasonable decisions without asking.** When this spec is silent, choose the simplest option that keeps the demo reliable, and leave a short `// DECISION:` comment.
4. **Everything must work offline after a warm-up.** All LLM calls go through a cache (§13). Live web calls always have a cached fallback.
5. **Be honest in the UI.** Anything simulated (ad launch, ad engagement) or fictional (demo companies) carries a visible `Simulated` or `Demo data` badge. Never fake "live" behaviour.
6. **The human approves everything.** Rekindle drafts and recommends. It never sends a message or launches a real ad.
7. Priorities are marked **P0** (must have for the demo), **P1** (should have, build only after all P0 is done), **P2** (stretch, only if time remains).

---

## 1. Product summary

### 1.1 The problem

B2B deals rarely die. They **stall**: "no budget till our funding closes," "we don't have a security lead yet," "we're locked into a competitor till December," "onboarding last time took 4 months."

Then three things go wrong:

1. **The reason is forgotten.** It was said on WhatsApp, a call or an email, never typed into the CRM.
2. **Nobody notices when it changes.** CRMs remind by *date*, not by *event*. The buyer raises money or hires the missing person, and nobody on the sales team knows.
3. **Marketing never hears it.** Sales hears the real objections. Marketing writes ads from the product page and spends money on strangers, while the warmest accounts the company ever touched go cold.

### 1.2 What we build tomorrow

A working web app where a sales team can:

1. **Capture** buyer conversations (pasted email, WhatsApp chat export, call voice note) with **zero manual data entry**.
2. **Remember** them: AI extracts *why the deal stalled* (with the verbatim quote as evidence), stated timing, competitor, stakeholders and commitments into a **Revenue Memory**.
3. **Watch** public company signals (live job postings from Greenhouse/Lever, funding/leadership news, stated dates, contract renewals, our own product changelog).
4. **Match** each signal to the *specific* stall reason. A funding round removes a budget objection. It does nothing for a missing-feature objection.
5. **Sort** every stalled deal into one of three lanes: **Revive now** (sales acts), **Warm up** (marketing acts), **Watch** (wait).
6. **Revive:** a Daily Brief of the 5–7 deals to reopen today, each with evidence and an AI draft that references the real past conversation.
7. **Warm:** turn the most common objection into a campaign (LinkedIn post, 3 ad variants, nurture email, landing-page hero) aimed **only** at the stalled accounts that raised it.
8. **Close the loop:** when a target account engages with the campaign (simulated in the demo), Rekindle moves it from *Warm* to *Revive now* and tells the rep, "The exact concern Karan raised is the ad his team just engaged with. Re-engage today."

### 1.3 The one-liner for every screen

> **Every "not now" has a reason. Rekindle remembers it, watches for it to change, and tells you when "now" arrives.**

### 1.4 What's real vs. simulated in the hackathon build

| Capability | Hackathon build | Badge in UI |
|---|---|---|
| Conversation capture (paste, WhatsApp .txt) | **Real** | — |
| Voice note transcription | **Real** if a transcription API key is set; otherwise cached transcript | `Cached transcript` when cached |
| AI extraction of Revenue Memory | **Real** (Claude), cached after first run | — |
| Job-posting signals (Greenhouse/Lever public APIs) | **Real** for real companies added live | `Live` |
| News/funding signals | **Seeded** for demo companies; **real** RSS for real companies (P1) | `Demo data` / `Live` |
| Date, renewal and changelog signals | **Real** (computed) | — |
| Matching and scoring | **Real** | — |
| Drafts | **Real** (Claude) | — |
| Campaign generation | **Real** (Claude) | — |
| Ad launch | **Simulated** | `Simulated` |
| Ad engagement | **Simulated** via Demo Controls | `Simulated` |
| Historical outcomes in "Revenue Loop" | **Seeded** | `Seeded history` |
| Demo companies and contacts | **Fictional** | `Demo data` |

---

## 2. Users and jobs-to-be-done

### 2.1 Personas

| Persona | Who | What they want from Rekindle |
|---|---|---|
| **Ananya, Account Executive** (primary user) | AE at CloudKavach, 60+ stalled deals, lives in WhatsApp | "Tell me who to call today, why, and what to say. Don't make me log anything." |
| **Vikram, Founder / Head of Sales** (buyer) | Runs a 6-person sales team | "Show me how much pipeline is rotting and get it back. Prove it in ₹." |
| **Neha, Marketing Lead** (secondary user) | 1-person marketing team | "Tell me what buyers actually object to, and give me campaigns that move real accounts." |

### 2.2 Jobs-to-be-done

1. *When I finish a call or WhatsApp chat,* I want the important parts saved automatically, *so I never lose why a deal stalled.*
2. *When I start my day,* I want a short, ranked list of deals worth reopening with the reason, *so I spend time only where timing is right.*
3. *When I reopen a deal,* I want a message that references what the buyer actually said, *so I sound like I remember them, because I do.*
4. *When planning marketing,* I want to know the most common objections across stalled deals, *so campaigns answer real concerns.*
5. *When a cold account starts engaging,* I want sales to know the same day, *so we don't miss the window.*

### 2.3 Product principles (use these to resolve any design question)

1. **Fewer, better actions.** Never show 500 leads. Show the 5 that matter today.
2. **Evidence over assertion.** Every recommendation shows *what they said* (verbatim, with date and source) next to *what changed* (with a source link).
3. **Zero data entry.** If the user must type it, we've failed. Corrections are one click.
4. **Human approves.** We draft; the rep sends.
5. **Speak rupees.** Every screen ties back to ₹ pipeline.
6. **Honest by default.** Simulated is labelled simulated.

---

## 3. Core concepts (glossary)

| Term | Meaning |
|---|---|
| **Seller** | The company using Rekindle. Demo seller: **CloudKavach** (fictional), a cloud security & compliance platform (SOC 2 / ISO 27001 automation) for Indian SaaS and fintech companies. |
| **Account** | A company the seller sells to. |
| **Deal** | An opportunity with an account. We focus on **stalled** deals. |
| **Interaction** | One captured conversation: email thread, WhatsApp chat, call transcript, meeting note. |
| **Revenue Memory** | Structured understanding of a deal, extracted by AI from interactions: stall category, evidence quote, timing, competitor, stakeholders, commitments, sentiment. |
| **Stall category** | Why the deal stalled. Fixed taxonomy (§3.1). |
| **Signal** | A dated event about an account: hiring, funding, leadership change, renewal window, feature shipped, campaign engagement, etc. Taxonomy in §3.2. |
| **Match** | A scored link between a deal's stall category and a signal, with an effect: `REMOVES`, `WEAKENS` or `NEUTRAL` the objection. |
| **Recommendation** | The best match for a deal, with priority score, lane, headline, explanation and evidence. |
| **Lane** | `REVIVE` (sales acts now), `WARM` (marketing keeps it warm), `WATCH` (nothing to do yet). |
| **Campaign** | Marketing assets generated from one stall category, targeted only at the stalled accounts that share it. |
| **Reverse intent** | A target account engaging with a campaign becomes a signal that can move its deal to `REVIVE`. |

### 3.1 Stall category taxonomy

| Code | Label in UI | Example buyer quote |
|---|---|---|
| `BUDGET` | Budget | "No budget till our Series B closes." |
| `TIMING` | Timing / priority | "Let's revisit after Q2 closes." |
| `NO_OWNER` | No owner / team yet | "We don't have anyone owning security yet." |
| `CHAMPION_LEFT` | Champion left | "Rahul, who was driving this, has moved on." |
| `COMPETITOR_LOCKIN` | Locked into competitor | "Our SecureGrid contract runs till December." |
| `MISSING_FEATURE` | Missing feature | "Auditors need ISO 27001 mapping, not just SOC 2." |
| `IMPLEMENTATION_EFFORT` | Implementation effort | "Last tool took 4 months to onboard." |
| `INTERNAL_APPROVAL` | Internal approval | "Board needs to sign off on new vendors." |
| `WENT_DARK` | Went dark | (No reply after proposal.) |
| `OTHER` | Other | — |

### 3.2 Signal taxonomy

| Code | Label | Source in hackathon build |
|---|---|---|
| `FUNDING` | Funding round | Seeded news; Google News RSS for real companies (P1) |
| `HIRING_RELEVANT` | Relevant hiring | **Live** Greenhouse/Lever job boards; seeded for demo companies |
| `LEADERSHIP_CHANGE` | Leadership change / leader hire | Seeded news; leadership titles in job boards |
| `EXPANSION` | Expansion (new market/office) | Seeded news; RSS (P1) |
| `PRODUCT_LAUNCH` | Product launch | Seeded news; RSS (P1) |
| `COMPLIANCE_EVENT` | Compliance / audit event | Seeded (e.g., "preparing for enterprise audit") |
| `DATE_REACHED` | Stated date reached | **Computed** from memory `stated_timing.resolved_date` |
| `RENEWAL_WINDOW` | Competitor renewal window open | **Computed** from memory `competitor.contract_end_date` |
| `FEATURE_SHIPPED` | We shipped what they asked for | **Computed** from seller changelog × memory `missing_feature.feature_key` |
| `CAMPAIGN_ENGAGEMENT` | Engaged with our campaign | **Simulated** engagement events |

---

## 4. The golden demo path (P0, build everything around this)

Target length: **3 minutes**. Everything here must work from `npm run demo:reset` with no network (after cache warm-up), and with network for the live-signal step.

**Scene 1: "Rot" (Today screen, 20 sec)**
- App opens on **Today**. KPI row: **₹2.2 Cr dormant pipeline · 20 stalled deals · 5 to revive today · 3 warming.**
- Presenter: "This sales team has ₹2.2 crore of deals that said 'not now'. Rekindle found 5 where 'now' has arrived."

**Scene 2: "Remember" (Capture, 40 sec)**
- Go to **Capture**. Upload `demo/conversations/finvara_whatsapp.txt` (Hinglish WhatsApp export), or play/upload the Kredo voice note.
- Show the parsing steps: *Parsing → Understanding → Saved to Revenue Memory.*
- The extraction card appears: **Stall reason: Budget**, with the verbatim quote *"abhi budget nahi hai… Ping me once the round closes"* **highlighted inside the original chat**, plus stakeholders and commitments.
- Presenter: "No one typed anything. It understood a Hinglish WhatsApp chat."

**Scene 3: "Watch + Match" (Today → Account Brain, 40 sec)**
- Back on **Today**, the top card: **Finvara Pay · ₹22 L · Revive now · 96**
  *"Raised ₹180 Cr Series B — the budget blocker is gone."*
  Evidence: **They said (14 Mar, WhatsApp):** "No budget till Series B closes" ↔ **What changed (24 Sep, news):** "Finvara Pay raises ₹180 Cr Series B".
- Click **Generate draft** to get a WhatsApp-style message that references the March conversation and congratulates them on the round. Edit inline, **Copy**, **Mark as sent**.
- **Live moment:** click **Run signal check**. The live account (a real company added via its Greenhouse/Lever board, §12.4) pulls **real job postings now** and shows "Hiring 3 relevant roles" with links.

**Scene 4: "Warm" (Insights & Campaigns, 50 sec)**
- Go to **Insights & Campaigns**. The bar chart shows **Implementation effort** is the #1 stall reason: **6 of 20 deals, ₹62 L**.
- Click it to see 5 verbatim quotes. Click **Generate campaign**.
- Campaign appears: core message **"Live in 14 days, not 4 months."** Rationale cites the objection count. Tabs: LinkedIn post · 3 ad variants (rendered as LinkedIn-style ad cards) · nurture email · landing-page hero.
- Target audience: **only the 6 stalled accounts** that raised this objection.
- Click **Launch to target accounts** (badge: `Simulated`).

**Scene 5: "Revive" (the loop, 30 sec)**
- Open **Demo Controls → Simulate engagement**. Engagement events stream in.
- Toast: **"Tripnest moved to Revive now: 3 people engaged with 'Live in 14 days', the exact concern Karan raised in May."**
- Today now shows Tripnest in Revive with evidence: *quote ↔ campaign engagement*.
- Presenter: "Sales taught marketing what to say. Marketing told sales who to call. That loop is Rekindle."

**Scene 6: Close (Revenue Loop, 20 sec, P1)**
- **Revenue Loop** screen: funnel (recommended → sent → replied → meeting → won) and the learning table "Budget × Funding → 41% reply rate" (`Seeded history`).
- Closing line: "Start by reviving lost deals. End as the revenue brain of every B2B company."

---

## 5. Scope

### 5.1 P0: must have

1. Seeded demo workspace (seller, 20 accounts, conversations, memories, signals) with `npm run demo:reset`.
2. App shell: sidebar navigation, header with logo, workspace name, `Demo mode` badge.
3. **Today** (Daily Brief) with KPI row, Revive / Warm / Watch lanes, recommendation cards with evidence.
4. **Account Brain** (account detail) with Revenue Memory, timeline, signals, recommendation and draft composer.
5. **Capture**: paste text and WhatsApp `.txt` upload → AI extraction → evidence highlight → save.
6. LLM wrapper with structured output, retries, cache, offline mode.
7. Signal engine: live Greenhouse/Lever fetch, computed date/renewal/changelog signals, seeded news.
8. Matcher and scoring (rules + LLM verification + templated fallback) and lane assignment.
9. Draft generator (email and WhatsApp variants).
10. **Insights & Campaigns**: objection chart, quotes, campaign generation, simulated launch.
11. **Demo Controls**: simulate engagement → reverse-intent signal → re-match → toast and lane change.
12. Add Account flow (name, domain, careers board provider + token) for the live signal moment.

### 5.2 P1: should have

1. Voice note upload → transcription (provider API) with cached-transcript fallback.
2. **Pipeline Audit**: CSV upload of a CRM export → batch extraction → audit report (₹ dormant, by objection, revivable now, top 5).
3. **Revenue Loop** screen: outcome funnel, learning table, campaign impact (seeded history plus live outcomes).
4. Outcome buttons on recommendations: Replied / Meeting booked / Won / No response.
5. Live Google News RSS signals for real companies.
6. **Settings → Seller profile and changelog**: adding a changelog entry creates `FEATURE_SHIPPED` signals and re-matches.
7. Memory correction: edit the stall category or timing in one click; the matcher re-runs.

### 5.3 P2: stretch

1. Ad image generation for ad variants.
2. Keyboard shortcuts (`J/K` to move through recommendations, `D` to draft).
3. Export the audit report as PDF.
4. `.eml` email upload.

### 5.4 Non-goals (do NOT build)

- Authentication, multi-user, roles, billing.
- A contact/people database, scraping LinkedIn, or collecting personal phone numbers.
- Sending emails/WhatsApp messages, or publishing real ads.
- Gmail/Outlook OAuth sync (mention as roadmap only).
- A full CRM (pipeline kanban, tasks, etc.).
- Video generation.

---

## 6. Screens and UX (detailed)

### 6.0 App shell (P0)

- **Left sidebar** (240px, collapsible): Logo (provided `public/logo.svg`), then nav:
  1. **Today** (`/`)
  2. **Accounts** (`/accounts`)
  3. **Capture** (`/capture`)
  4. **Insights & Campaigns** (`/insights`)
  5. **Revenue Loop** (`/loop`, P1)
  6. **Pipeline Audit** (`/audit`, P1)
  7. **Settings** (`/settings`, P1)
- **Header:** workspace name "CloudKavach", `Demo mode` badge, **Run signal check** button (global), **Demo Controls** button (opens right drawer).
- **Toasts** top-right for lane changes and errors.
- **Primary resolution:** 1440×900. **Must also look right at 1280×720 and 125% zoom** (projector).

### 6.1 Today: Daily Brief (`/`) (P0)

**Purpose:** Answer "who should I contact today, and why?" in under 10 seconds.

**Layout (top to bottom):**

1. **Greeting:** "Good morning, Ananya" + date in `Asia/Kolkata`. Sub-line: "5 deals are ready to revive. 3 are warming up." (computed, never hardcoded)
2. **KPI row (4 stat tiles):**
   - **Dormant pipeline:** sum of stalled deal values (₹2.2 Cr in the seed), with count of stalled deals underneath.
   - **Revive now:** count + ₹ value.
   - **Warming up:** count + count of active campaigns.
   - **Signals this week:** count, with "x live" underneath.
3. **Revive now** section (main focus). Ranked list of **Recommendation cards**, sorted by priority score.
4. **Warming up** section: compact rows: account, stall category chip, campaign name if targeted, engagement count, "Open".
5. **Watching** section: collapsed by default; "14 deals watched — no change yet". Expand to a compact table.

**Recommendation card (core component, reused on Account Brain):**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Finvara Pay · Fintech · Bengaluru              ₹22 L    [ 96 ]  REVIVE │
│ Raised ₹180 Cr Series B: the budget blocker is gone                    │
│                                                                        │
│ THEY SAID · 14 Mar · WhatsApp · Rohan Kapoor (VP Eng)                  │
│ "abhi budget nahi hai… Ping me once the round closes"                  │
│                                ↓                                       │
│ WHAT CHANGED · 24 Sep · News · Demo data                               │
│ Finvara Pay raises ₹180 Cr in Series B led by Northbridge  [source ↗]  │
│                                                                        │
│ Why: Funding removes a budget objection. They asked you to reconnect   │
│ after the round.                                                       │
│                                                                        │
│ [Generate draft]  [Open account]  [Snooze 7d]  [Dismiss]               │
└──────────────────────────────────────────────────────────────────────┘
```

- **Score badge:** the priority score (0–100) in a ring; hovering shows a breakdown (match, value, signals).
- **Lane chip:** `REVIVE` (ember accent), `WARM` (amber), `WATCH` (neutral).
- **Effect label** under "Why": `Removes objection` / `Weakens objection`.
- **Multiple signals:** show the strongest; "+2 more signals" expands.
- **Generate draft** opens the **Draft panel** (slide-over, right side, 480px) — see §6.2.4.
- **States:** loading skeletons; empty state "No deals ready today. 14 are being watched. We'll tell you when something changes."; error state with Retry.

**Run signal check (header button):** opens a small progress popover listing each source as it runs ("Greenhouse · Acme · 3 relevant roles found ✓", "Dates & renewals ✓", "Changelog ✓"), then re-runs the matcher and refreshes Today. Any deal that changed lanes triggers a toast.

### 6.2 Account Brain: account detail (`/accounts/[id]`) (P0)

**Purpose:** Everything about one account on one screen: what they said, what changed, what to do.

**Header:** Account name, `Demo data` / `Live` badge, industry · size · city, domain link. Right side: deal value, stage, lane chip, priority ring.

**Three-column layout (stacks on narrow screens):**

**Left column (320px): Revenue Memory card**
- **Stall reason:** category chip + one-line summary.
- **Evidence:** verbatim quote in a quote block, with speaker, date, channel, and a link "View in conversation" (scrolls the timeline to the highlighted message).
- **Stated timing:** "After Series B closes" → resolved date or "event-based".
- **Competitor:** name + contract end date (if any).
- **Missing feature:** description + feature key (if any).
- **Stakeholders:** name, title, role chip (champion / decision maker / influencer / blocker), sentiment dot.
- **Commitments:** "We promised: SOC 2 readiness checklist ✓" / "They promised: revisit after round".
- **Sentiment:** warm / neutral / cold.
- **Confidence:** low confidence shows a yellow "Check this" hint.
- **Edit** (P1): change category and timing via dropdown/date picker; the change saves and re-matches.

**Center column: Relationship timeline**
- Reverse-chronological feed merging interactions, signals, campaign engagement, recommendations and outcomes.
- Each item has an icon by type, date, title, and an expandable body. Interactions show the full text with the evidence quote **highlighted**.
- Filters: All / Conversations / Signals / Marketing.

**Right column (360px): Next best action**
- The current recommendation card (compact) with score breakdown:
  - Match score (and effect), deal value score, signal freshness.
- **Draft composer** (inline version of §6.2.4).
- **Signals list** with source links and badges (`Live`, `Demo data`, `Computed`, `Simulated`), plus a **Refresh signals** button for this account.
- **Outcome buttons** (P1): Replied · Meeting booked · Won · No response.

#### 6.2.4 Draft panel / composer (P0)

- **Channel toggle:** `WhatsApp` | `Email` (default: the channel of the last interaction).
- **Tone toggle** (P1): `Warm` | `Direct`.
- Generated output: subject (email only), body (editable textarea), and "Why this works" (1–2 bullets, collapsible).
- Buttons: **Regenerate**, **Copy**, **Mark as sent** (records an Outcome `sent`, sets the recommendation to `sent`, and moves the card to a "Done today" strip).
- Never auto-sends. Small footer: "Rekindle never sends on your behalf."

### 6.3 Accounts list (`/accounts`) (P0, simple)

- Table: Account · Industry · Deal value · Stall reason · Lane · Priority · Last touch · Latest signal.
- Filters: lane, stall category. Search by name.
- **Add account** button → modal:
  - Company name (required), domain, industry, city.
  - **Careers board:** provider (`Greenhouse` / `Lever` / `None`) + board token, with a **Test** button that calls the API and shows "✓ 47 open roles found" or an error.
  - Deal value (₹), owner (defaults to Ananya).
  - On save: create account and a stalled deal, then redirect to **Capture** with this account preselected.

### 6.4 Capture (`/capture`) (P0)

**Purpose:** Turn a messy conversation into Revenue Memory in one step.

**Step 1: Choose account.** Combobox of existing accounts, plus "+ New account" (inline mini form: name + domain).

**Step 2: Add conversation.** Tabs:
- **Paste text** (email thread, notes, call transcript). Textarea plus channel select (Email / Call / Meeting / Note) and date (defaults to today).
- **WhatsApp export** (`.txt` upload, drag-and-drop). A preview of parsed messages shows (speaker, timestamp, text) before extraction. Helper text: "WhatsApp → chat → ⋮ → More → Export chat → Without media".
- **Voice note** (P1): upload `.mp3/.m4a/.wav/.ogg/.opus` (≤ 25 MB) → transcribe → show transcript (editable) → continue.
- **Sample buttons** (P0, for demo speed): "Load Finvara WhatsApp sample", "Load Kredo call sample", etc. These load files from `demo/conversations/`.

**Step 3: Extract.** Button **Understand conversation**. Show a 3-step progress indicator: *Parsing → Understanding → Saving to Revenue Memory* (real steps, not fake delays; minimum display 400ms per step so it's readable).

**Step 4: Result.**
- Left: the original conversation with the evidence quote **highlighted** (yellow/ember underline) and stakeholders' names bolded.
- Right: extraction card (same fields as the Memory card) with **Looks right** (save) and **Edit** controls.
- After saving: "Saved. Running a signal check for {Account}…" → shows the resulting lane and recommendation (if any), with **Open account** and **Back to Today**.

**Validation and errors:**
- Empty input → disabled button.
- WhatsApp parse finds 0 messages → "This doesn't look like a WhatsApp export. Try pasting as text instead."
- LLM failure → retry once automatically; then show "We couldn't read this right now" with **Retry**, and keep the user's input.
- If the evidence quote isn't found verbatim in the text (see §7.1.4), mark confidence low and show "Check this".

### 6.5 Insights & Campaigns (`/insights`) (P0)

**Purpose:** Turn sales objections into marketing that targets the exact accounts that raised them.

**Top: Objection breakdown**
- Horizontal bar chart (Recharts): one bar per stall category, sorted desc, showing **deal count** with **₹ value** as a label. Use the categorical colors from the design system; the selected bar is highlighted.
- Sub-heading: "What's stopping your deals: from 20 stalled conversations."

**Click a category → Objection panel:**
- Headline: "Implementation effort · 6 deals · ₹62 L · 30% of stalled deals".
- **Top 5 verbatim quotes** (speaker title + company + date). Fictional data only.
- **Accounts** list (chips) with lane.
- **Generate campaign** button.

**Campaign view (after generation):**
- **Header:** campaign name, status chip (`Draft` → `Launched · Simulated`).
- **Core message** in large type: "Live in 14 days, not 4 months."
- **Why this message:** rationale that cites the objection count and quotes, and which seller proof points it uses.
- **Assets tabs:**
  1. **LinkedIn post** (founder voice) rendered as a post mockup.
  2. **Ad variants (3)** rendered as LinkedIn single-image ad cards: intro text, headline, CTA button, image area (a gradient placeholder using brand colors plus the headline; P2: generated image). Each variant shows its "angle" tag (Proof / Pain / Speed).
  3. **Nurture email** (subject + body).
  4. **Landing page hero** rendered as a mini page: headline, subhead, 3 bullets, CTA.
- **Target audience:** "6 stalled accounts that raised this objection" (list). Note: "LinkedIn matched audiences need a minimum audience size; in production we'd group accounts or add look-alikes."
- Buttons: **Regenerate**, **Copy all**, **Launch to target accounts** (`Simulated`).
- After launch: campaign status changes; target accounts' deals move to `WARM` if they were `WATCH`; a stats strip shows Impressions (simulated), Engaged accounts, Moved to Revive.

### 6.6 Demo Controls drawer (P0)

Right-side drawer, clearly titled **Demo Controls (Simulated events)**.

- **Simulate campaign engagement:** choose campaign (default: latest launched) → **Run**. It creates engagement events for a predefined set (default: Tripnest ×3, Zestcart ×3, Edunova ×1), streaming one every ~600ms in a mini log, then re-runs the matcher and fires toasts for lane changes.
- **Advance time** (P2): +30 days for date signals.
- **Reset demo data:** calls `/api/demo/reset` (confirm dialog).
- **Cache status:** "LLM cache: 42 entries · Offline mode: on/off".

### 6.7 Revenue Loop (`/loop`) (P1)

- **Funnel:** Recommendations → Drafted → Sent → Replied → Meeting → Won (counts and ₹). Seeded history plus live outcomes.
- **What revives deals (learning table):** rows = stall category × signal type; columns = recommendations, reply rate, meeting rate. Sorted by reply rate. `Seeded history` badge.
- **Campaign impact:** per campaign: target accounts, engaged accounts, moved to Revive, ₹ pipeline influenced.
- Insight callouts (computed, templated): "Budget objections reopen best after funding: 41% reply rate."

### 6.8 Pipeline Audit (`/audit`) (P1)

**Purpose:** The free lead magnet in the business model. Upload a CRM export and get a ₹ number in 60 seconds.

- Upload CSV (template downloadable). Expected columns: `company, deal_value_inr, stage, last_activity_date, owner, notes`. Map columns if headers differ (simple dropdown mapping).
- Process up to 50 rows: rows with `stage` in (lost, stalled, closed-lost, on hold, nurture) or `last_activity_date` > 45 days are treated as stalled. Run extraction on `notes` (concurrency 5, cached).
- **Audit report:**
  - Hero: "**₹1.6 Cr** of stalled pipeline across **31 deals**."
  - "**₹54 L** revivable now" (deals whose stall reason is date-based and the date has passed, or with existing signals).
  - Objection breakdown chart.
  - Top 5 deals to revive with reason.
  - CTA: "Import into Rekindle" (adds accounts and deals).
- Sample file: `demo/pipeline_export.csv` (generate 30 realistic fictional rows with short notes, ~50% Hinglish/English mix).

### 6.9 Settings (`/settings`) (P1)

- **Seller profile:** name, one-liner, product description, ICP, personas, **proof points** (the only facts campaigns may use), **relevant role keywords** (used to filter job postings).
- **Changelog:** list of shipped features `{date, title, feature_key}`. **Add entry** → creates `FEATURE_SHIPPED` signals for deals whose `missing_feature.feature_key` matches → re-match → toast.

---

## 7. Intelligence engines

All engines live in `src/lib/engines/`. Pure functions where possible; side effects isolated in services.

### 7.1 Extraction engine (P0)

**Input:** interaction text (normalized), channel, interaction date, account name, seller profile (for feature keys), today's date.
**Output:** `MemoryExtraction` (schema in §8.2).

**Steps:**
1. **Normalize:** WhatsApp → `[YYYY-MM-DD HH:mm] Speaker: message` lines; email/paste → trimmed; transcript → as is. Cap at ~12k characters (keep the most recent part if longer, and note truncation).
2. **LLM call** (smart model) with the extraction prompt (§8.1) and the forced-tool structured output.
3. **Validate** with zod. On failure → one retry with the validation error appended → then fall back to `OTHER` with confidence 0.2.
4. **Evidence check (important for trust):** verify `evidence_quote` appears in the source text after normalizing whitespace and case. If not exact, find the best fuzzy-matching message (token overlap ≥ 0.6) and replace the quote with that exact source substring. If still not found, set `confidence = min(confidence, 0.4)` and flag `evidence_verified = false`.
5. **Date resolution:** the LLM returns `resolved_date`; sanity check that it's a valid ISO date within [interaction date, interaction date + 24 months], else null.
6. **Merge:** if the deal already has a memory, the newer interaction wins for stall category *unless* the new extraction has lower confidence; stakeholders and commitments are unioned (dedupe by name/text).
7. Save `Memory`, link `stallEvidenceInteractionId`.

**India-specific rules (put in prompt):**
- Understand Hindi, English and Hinglish (romanized Hindi). Keep quotes in the original language; the summary is in English.
- Indian financial year runs April–March. "Q3" means Oct–Dec unless they clearly use calendar quarters. "Next FY" means from 1 April.
- "After Diwali", "after the festive season" → resolve to a date (best estimate); "after the round closes" → event-based (`resolved_date = null`, `event_trigger = "FUNDING"`).

### 7.2 WhatsApp parser (P0)

`src/lib/parsers/whatsapp.ts`. Must handle:
- Android: `14/03/26, 11:02 am - Rohan Kapoor: message` (also `14/03/2026`, `AM/PM`, 24h `11:02`).
- iOS: `[14/03/26, 11:02:45 AM] Rohan Kapoor: message`.
- Narrow no-break space (` `) before am/pm, and the left-to-right mark (`‎`).
- Multi-line messages (lines without a timestamp prefix append to the previous message).
- System lines to skip: "Messages and calls are end-to-end encrypted…", "<Media omitted>", "image omitted", "This message was deleted", "joined using this group's invite link".
- **Date order is DD/MM** (India default). If any day value > 12 is in position 2, switch to MM/DD for the whole file.
- Output: `{ speaker, timestamp (ISO, Asia/Kolkata), text }[]`, plus `participants[]`.
- **Unit tests** for all of the above (Vitest).

### 7.3 Transcription (P1)

`src/lib/transcribe.ts`
- Provider selected by env: `TRANSCRIBE_PROVIDER=openai|groq|none`. Both expose an OpenAI-compatible `audio/transcriptions` endpoint (OpenAI `whisper-1`; Groq `whisper-large-v3`). Use the `openai` npm client with a configurable `baseURL`.
- No `language` parameter (let it auto-detect Hindi/English mix).
- Fallback: if provider is `none` or the call fails, look up `demo/transcripts/{audio-file-basename}.txt`; if found, return it with `cached: true` (UI shows `Cached transcript`). Otherwise show an error and offer "Paste transcript instead".

### 7.4 Signal engine (P0)

`src/lib/engines/signals/`. Each collector returns `SignalInput[]`. A `dedupeKey` (e.g., `greenhouse:{token}:{jobId}`, `news:{hash(url)}`, `date:{dealId}:{date}`) prevents duplicates.

**7.4.1 Job boards (live, P0)**
- Greenhouse: `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=false` → `jobs[]` with `id, title, absolute_url, updated_at, location.name`.
- Lever: `GET https://api.lever.co/v0/postings/{token}?mode=json` → array with `id, text (title), hostedUrl, createdAt (ms), categories.location, categories.team`.
- Timeout 8s. On failure: use the last cached response stored in `SourceCache` (table) and mark the result `stale`.
- **Relevance filter:** title matches any seller `relevantRoleKeywords` (case-insensitive word match). Default keywords for CloudKavach: `security, devsecops, appsec, infosec, compliance, grc, soc, cloud, infrastructure, sre, platform, devops, risk, audit, ciso`.
- Emit **one aggregated** `HIRING_RELEVANT` signal per account per run if ≥ 1 relevant role: title "Hiring {n} relevant roles", detail lists up to 5 titles with links, `occurredAt` = newest job date. (Use `updated_at` for Greenhouse because creation date isn't returned; label it "updated".)
- If any relevant title contains a leadership term (`head|lead|director|vp|vice president|chief|ciso|cto|manager`), also emit `LEADERSHIP_CHANGE` with title "Hiring a {title}" (detail: "Leader hire in a relevant function").

**7.4.2 Computed signals (P0)** (run on every match pass; no network)
- `DATE_REACHED`: memory `stated_timing.resolved_date` ≤ today + 7 days.
- `RENEWAL_WINDOW`: memory `competitor.contract_end_date` within the next **75 days** (or passed within the last 30 days).
- `FEATURE_SHIPPED`: seller changelog entry with `feature_key` == memory `missing_feature.feature_key` and entry date > memory interaction date.

**7.4.3 Seeded news (P0)**
- Demo accounts have pre-seeded `FUNDING / LEADERSHIP_CHANGE / EXPANSION / PRODUCT_LAUNCH / COMPLIANCE_EVENT` signals with `Demo data` badge and a plausible (non-clickable or `#`) source.

**7.4.4 Live news via Google News RSS (P1)**
- `https://news.google.com/rss/search?q="{company}"+(raises OR funding OR appoints OR expands OR launches)&hl=en-IN&gl=IN&ceid=IN:en`, parse with `rss-parser`, keep items ≤ 120 days old.
- Classify the headline by keywords: FUNDING (`raises|funding|series [a-e]|crore|million|investment`), LEADERSHIP_CHANGE (`appoints|names|joins as|new cto|new ciso|chief`), EXPANSION (`expands|opens|enters|new office`), PRODUCT_LAUNCH (`launches|unveils|introduces`). No match → drop.
- Require the company name in the title (case-insensitive) to reduce false positives.

**7.4.5 Campaign engagement (P0, simulated)**
- Engagement events (`ad_click`, `post_engagement`, `landing_visit`, `email_click`) for an account are aggregated into one `CAMPAIGN_ENGAGEMENT` signal per account per campaign: title "{n} people engaged with '{campaign core message}'", detail lists event types and anonymized job titles (e.g., "Engineering Manager, Platform Engineer") — **no personal names**. `isSimulated = true`.

### 7.5 Matching and scoring engine (P0)

`src/lib/engines/match.ts`. Deterministic rules first; the LLM refines the explanation and effect. The app must work fully with rules only.

**7.5.1 Rule matrix (objection × signal → base score 0–100)**

| Stall ↓ / Signal → | FUNDING | HIRING_RELEVANT | LEADERSHIP_CHANGE | EXPANSION | PRODUCT_LAUNCH | COMPLIANCE_EVENT | DATE_REACHED | RENEWAL_WINDOW | FEATURE_SHIPPED |
|---|---|---|---|---|---|---|---|---|---|
| BUDGET | **95** | 45 | 35 | 60 | 30 | 50 | 70 | 20 | 20 |
| TIMING | 50 | 45 | 40 | 45 | 35 | 50 | **92** | 30 | 30 |
| NO_OWNER | 40 | **95** | 85 | 40 | 25 | 55 | 50 | 20 | 20 |
| CHAMPION_LEFT | 30 | 55 | **90** | 25 | 20 | 35 | 40 | 20 | 20 |
| COMPETITOR_LOCKIN | 25 | 30 | 45 | 25 | 20 | 30 | 60 | **95** | 40 |
| MISSING_FEATURE | 20 | 25 | 25 | 20 | 20 | 40 | 30 | 20 | **95** |
| IMPLEMENTATION_EFFORT | 30 | 60 | 40 | 30 | 25 | 45 | 40 | 20 | 50 |
| INTERNAL_APPROVAL | 50 | 35 | 65 | 40 | 25 | 55 | 55 | 20 | 25 |
| WENT_DARK | 50 | 50 | 50 | 45 | 40 | 45 | 40 | 30 | 35 |
| OTHER | 40 | 40 | 40 | 35 | 30 | 40 | 50 | 30 | 30 |

**`CAMPAIGN_ENGAGEMENT` rule** (replaces a matrix column; based on engagement events from that account for that campaign in the last 14 days):

| Engagement events | Campaign objection = deal's stall category | Different category |
|---|---|---|
| 1 | 45 | 35 |
| 2 | 65 | 50 |
| ≥ 3 | **85** | 65 |

This guarantees one curious click doesn't send a deal to Revive, while three people from the same account engaging with the campaign about *their* objection does.

**7.5.2 Freshness multiplier** (signal age = today − occurredAt)
- ≤ 14 days: 1.0 · ≤ 45 days: 0.85 · ≤ 90 days: 0.7 · ≤ 180 days: 0.5 · older: ignore.
- Signals that happened **before** the stall evidence date are ignored (they can't have changed anything).
- Computed signals (`DATE_REACHED`, `RENEWAL_WINDOW`, `FEATURE_SHIPPED`) use freshness 1.0.

**7.5.3 Rule match score**
```
for each eligible signal s: ruleScore(s) = matrix[stall][s.type] × freshness(s)
best = max ruleScore
bonus = 6 × (number of OTHER signals with ruleScore ≥ 50), capped at 12
ruleMatch = min(100, best + bonus)
```

**7.5.4 LLM verification** (only when `best ≥ 50`, to save calls; fast model; cached by memory+signal hash)
- Prompt §8.3 returns `{ effect: REMOVES|WEAKENS|NEUTRAL, confidence 0–1, headline ≤ 12 words, explanation ≤ 2 sentences }`.
- `llmScore = REMOVES 95 · WEAKENS 65 · NEUTRAL 20`.
- `matchScore = round(0.6 × ruleMatch + 0.4 × llmScore)`.
- If the LLM fails: `matchScore = ruleMatch`, effect = `REMOVES` if ruleMatch ≥ 80, `WEAKENS` if ≥ 50, else `NEUTRAL`; use the templated headline/explanation (§7.5.7).

**7.5.5 Priority score**
```
valueScore = percentile rank of deal value among all stalled deals (0–100)
priority   = round(0.7 × matchScore + 0.3 × valueScore)
```

**7.5.6 Lane assignment**
- `REVIVE` if matchScore ≥ 70 **and** effect ≠ `NEUTRAL`.
- `WARM` if (40 ≤ matchScore < 70) **or** the deal's account is a target of a launched campaign.
- `WATCH` otherwise.
- Store the previous lane; when it changes, write a `LaneChange` event (used for toasts and the timeline).

**7.5.7 Templated fallbacks**
- Headline by signal type, e.g. FUNDING → "{signal.title}: the budget blocker may be gone"; HIRING_RELEVANT → "{n} relevant roles opened: the missing owner is being hired"; RENEWAL_WINDOW → "{competitor} contract ends {date}: renewal window is open"; FEATURE_SHIPPED → "We shipped {feature}: the exact gap they raised"; DATE_REACHED → "{stated timing} has arrived"; CAMPAIGN_ENGAGEMENT → "{n} people engaged with '{message}': the concern they raised".
- Explanation: "They said \"{quote}\" on {date}. On {signal date}, {signal title}. This {removes|weakens} their {category label} objection."

**7.5.8 Unit tests**: matrix lookup, freshness, pre-evidence signal ignored, lanes, campaign category rule, fallback path.

### 7.6 Draft engine (P0)

- Inputs: seller profile, deal, contact (champion or decision maker), memory (quote, timing, commitments), top signal(s), channel, tone.
- Prompt §8.4. Output `{ subject|null, body, why_this_works[] }`.
- **Rules:** WhatsApp ≤ 70 words, email ≤ 120 words; reference the past conversation specifically (paraphrase or short quote); mention the change naturally and without sounding like surveillance ("Congrats on the Series B!" is fine; "our system detected" is not); fulfil any open commitment from us; exactly one clear, low-friction ask; no invented facts, numbers or customer names; match language (if the buyer wrote Hinglish on WhatsApp, a light Hinglish touch is OK; email stays English); no emojis in email, at most one in WhatsApp.

### 7.7 Campaign engine (P0)

- Inputs: stall category, all memories in that category (quotes, summaries), deal count and ₹ value, seller profile **proof points** and changelog, target accounts (names, industries).
- Prompt §8.5. Output: `CampaignDraft` (§8.2).
- **Rules:** only use facts from proof points/changelog; if a needed proof is missing, use a bracketed placeholder like `[customer name]` and never invent one; never name target accounts or individuals in public assets; LinkedIn ad limits: intro ≤ 150 chars, headline ≤ 70 chars; the post is ≤ 1,200 chars; the email ≤ 150 words; the landing hero headline ≤ 10 words.
- After generation, compute the target list: accounts whose deals have this stall category and are not `won/lost`.

### 7.8 Reverse intent loop (P0)

On **Simulate engagement**:
1. Create `EngagementEvent`s (with `isSimulated = true`) for the configured accounts.
2. Upsert the aggregated `CAMPAIGN_ENGAGEMENT` signal per account.
3. Re-run the matcher for those accounts' deals.
4. Return lane changes; the UI shows toasts: "**{Account} moved to Revive now**: {n} people engaged with '{message}', the exact concern {contact first name} raised in {month}."

### 7.9 Learning (P1, simple)

- `Outcome` events per recommendation. The learning table aggregates by (stall category, top signal type): count, reply rate = replied/sent, meeting rate = meeting/sent.
- Seeded history: 60 past recommendations with outcomes (tuned so FUNDING×BUDGET and HIRING×NO_OWNER perform best, and CAMPAIGN_ENGAGEMENT×IMPLEMENTATION_EFFORT is strong).
- Display only; the matcher doesn't learn from outcomes in the hackathon build (say "learning" honestly as roadmap in the pitch).

---

## 8. Prompts and schemas

All LLM calls use `callStructured()` (§11.3), which forces a single tool whose `input_schema` is generated from the zod schema (`zod-to-json-schema`). Put prompts in `src/lib/prompts/*.ts` as template functions.

### 8.1 Extraction prompt

**System:**
```
You are Rekindle's sales-conversation analyst for B2B sales teams in India.
You read messy buyer conversations (email threads, WhatsApp chats, call transcripts)
in English, Hindi or Hinglish, and extract structured "revenue memory".

Rules:
- Be faithful. Extract only what is stated or clearly implied. Never invent names, dates, numbers or competitors.
- evidence_quote MUST be copied verbatim from the conversation (original language, original spelling), max 220 characters.
  Choose the single sentence or two that best shows WHY the deal stalled.
- stall_category must be one of the allowed codes. If several apply, choose the one that is
  actually blocking the purchase right now.
- Dates: today's date and the conversation date are given. Resolve relative timing
  ("next quarter", "after Q3", "in January", "after Diwali") to an ISO date (YYYY-MM-DD).
  Assume the Indian financial year (April–March) for "Q1–Q4" and "FY" unless calendar quarters are clear.
  If timing depends on an event (e.g., "after our round closes", "once we hire a security lead"),
  set resolved_date to null and set event_trigger to the matching signal type.
- missing_feature.feature_key must be one of the provided feature keys, or null.
- Summaries are in English, concise, written for a busy salesperson.
```

**User:**
```
SELLER: {seller.name}: {seller.oneLiner}
KNOWN FEATURE KEYS: {featureKeys as list "key: description"}
ACCOUNT: {account.name}
CHANNEL: {channel}
CONVERSATION DATE: {interactionDate}
TODAY: {today}

CONVERSATION:
"""
{normalizedText}
"""

Extract the revenue memory.
```

### 8.2 Schemas (zod, in `src/lib/schemas.ts`)

```ts
export const StallCategory = z.enum([
  "BUDGET","TIMING","NO_OWNER","CHAMPION_LEFT","COMPETITOR_LOCKIN",
  "MISSING_FEATURE","IMPLEMENTATION_EFFORT","INTERNAL_APPROVAL","WENT_DARK","OTHER",
]);

export const SignalType = z.enum([
  "FUNDING","HIRING_RELEVANT","LEADERSHIP_CHANGE","EXPANSION","PRODUCT_LAUNCH",
  "COMPLIANCE_EVENT","DATE_REACHED","RENEWAL_WINDOW","FEATURE_SHIPPED","CAMPAIGN_ENGAGEMENT",
]);

export const MemoryExtraction = z.object({
  stall_category: StallCategory,
  stall_reason_summary: z.string().max(140),          // English, ≤ ~20 words
  evidence_quote: z.string().max(220),                // verbatim from source
  evidence_speaker: z.string().nullable(),
  evidence_date: z.string().nullable(),               // ISO date if known
  stated_timing: z.object({
    text: z.string().nullable(),                      // "after Series B closes"
    resolved_date: z.string().nullable(),             // YYYY-MM-DD
    event_trigger: SignalType.nullable(),             // e.g. FUNDING
  }),
  competitor: z.object({
    name: z.string().nullable(),
    contract_end_date: z.string().nullable(),
  }),
  missing_feature: z.object({
    description: z.string().nullable(),
    feature_key: z.string().nullable(),
  }),
  stakeholders: z.array(z.object({
    name: z.string(),
    title: z.string().nullable(),
    role: z.enum(["champion","decision_maker","influencer","blocker","unknown"]),
    sentiment: z.enum(["positive","neutral","negative"]),
  })).max(8),
  commitments: z.array(z.object({
    by: z.enum(["us","them"]),
    text: z.string().max(160),
    due_date: z.string().nullable(),
    done: z.boolean(),
  })).max(8),
  buyer_sentiment: z.enum(["warm","neutral","cold"]),
  language: z.enum(["en","hi","hinglish","other"]),
  confidence: z.number().min(0).max(1),
});

export const MatchVerdict = z.object({
  effect: z.enum(["REMOVES","WEAKENS","NEUTRAL"]),
  confidence: z.number().min(0).max(1),
  headline: z.string().max(90),        // ≤ 12 words, no hype
  explanation: z.string().max(280),    // ≤ 2 sentences
});

export const DraftOutput = z.object({
  subject: z.string().max(80).nullable(),   // null for WhatsApp
  body: z.string().max(900),
  why_this_works: z.array(z.string().max(120)).max(3),
});

export const CampaignDraft = z.object({
  name: z.string().max(60),
  core_message: z.string().max(60),         // "Live in 14 days, not 4 months."
  angle: z.string().max(140),
  rationale: z.string().max(400),           // cites objection evidence + proof points used
  proof_points_used: z.array(z.string()).max(5),
  linkedin_post: z.string().max(1200),
  ads: z.array(z.object({
    angle_tag: z.enum(["PROOF","PAIN","SPEED","RISK","ROI"]),
    intro_text: z.string().max(150),
    headline: z.string().max(70),
    cta: z.enum(["Learn more","Book a demo","Download","Get started","Request demo"]),
    image_prompt: z.string().max(200),      // for P2 image gen / placeholder art direction
  })).length(3),
  nurture_email: z.object({ subject: z.string().max(80), body: z.string().max(1000) }),
  landing_hero: z.object({
    headline: z.string().max(70),
    subhead: z.string().max(160),
    bullets: z.array(z.string().max(90)).length(3),
    cta: z.string().max(30),
  }),
});
```

### 8.3 Match verification prompt (fast model)

**System:**
```
You judge whether a new event changes why a B2B deal stalled.
Return:
- effect: REMOVES (the stated blocker is very likely gone), WEAKENS (it's plausibly reduced),
  or NEUTRAL (unrelated).
- headline: ≤ 12 words, plain and specific, written for a salesperson. No hype, no exclamation marks.
- explanation: ≤ 2 sentences connecting what the buyer said to what changed.
Be conservative. Don't assume facts not given.
```
**User:**
```
STALL CATEGORY: {category}
WHAT THE BUYER SAID ({date}, {channel}, {speaker}): "{evidence_quote}"
SUMMARY: {stall_reason_summary}
STATED TIMING: {stated_timing.text or "none"}
SIGNAL ({signal.type}, {signal.occurredAt}): {signal.title}. {signal.detail}
```

### 8.4 Draft prompt (smart model)

**System:**
```
You write re-engagement messages for a B2B salesperson in India.
The buyer previously paused the deal. Something has changed. Write a short, human message
that proves we remember the conversation and makes a single low-friction ask.

Rules:
- Reference the earlier conversation specifically (month + what they said, paraphrased or a short quote).
- Mention what changed naturally, as a person would ("Congrats on the Series B!"). Never say
  you "tracked", "monitored" or "detected" anything.
- If we owe them something (open commitment by "us"), deliver or offer it.
- Exactly one ask (e.g., a 20-minute call this week, or "should I send the updated plan?").
- Use only facts given. No invented numbers, customers or features.
- WhatsApp: ≤ 70 words, conversational, first name, at most one emoji; a light Hinglish touch is OK
  only if the buyer used Hinglish. Email: ≤ 120 words, a specific subject line, no emojis.
- Sign off as {rep first name}.
```
**User:** seller name and one-liner, rep name, contact name and title, channel, tone, memory JSON (quote, summary, timing, commitments), top signal(s), shipped feature (if relevant), campaign engaged (if relevant).

### 8.5 Campaign prompt (smart model)

**System:**
```
You are a B2B demand-generation strategist. You turn REAL buyer objections from stalled
sales conversations into a focused campaign that answers that objection.

Rules:
- The campaign must directly answer the objection, using the buyers' own language where useful.
- Use ONLY the seller proof points and changelog provided. If a claim needs proof you don't have,
  use a bracketed placeholder like [customer name] or [metric]. Never invent customers, logos or numbers.
- Never name the target accounts or any individual in public assets.
- Tone: confident, specific, no buzzwords ("revolutionize", "synergy", "game-changer" are banned).
- Respect length limits exactly. Ads are LinkedIn single-image ads.
- rationale: explain in 2–3 sentences why this message, citing how many stalled deals raised the objection
  and which proof points you used.
```
**User:**
```
SELLER: {name}: {oneLiner}
PRODUCT: {product}
ICP / PERSONAS: {icp}; {personas}
PROOF POINTS (only facts you may use): {proofPoints list}
CHANGELOG: {changelog list}
OBJECTION: {category label}: raised in {n} of {total} stalled deals (₹{value} pipeline)
BUYER QUOTES (anonymized, verbatim):
- "{quote}" ({title}, {industry})
...
TARGET AUDIENCE: {n} stalled accounts in {industries}; roles: {roles}
```

---

## 9. Data model (Prisma, SQLite)

Use **Prisma + SQLite** (`prisma/schema.prisma`). Store JSON as `String` and parse with zod helpers (avoid relying on SQLite enum/Json support). All IDs are `cuid()`. All dates are stored in UTC and displayed in `Asia/Kolkata`.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

model SellerProfile {
  id                   String   @id @default(cuid())
  name                 String
  oneLiner             String
  product              String
  icp                  String
  personasJson         String   // string[]
  proofPointsJson      String   // string[]
  roleKeywordsJson     String   // string[]
  changelogJson        String   // {date, title, featureKey}[]
  repName              String   // "Ananya Rao"
  updatedAt            DateTime @updatedAt
}

model Account {
  id               String   @id @default(cuid())
  name             String
  domain           String?
  industry         String?
  sizeBand         String?  // "51-200"
  city             String?
  careersProvider  String   @default("none") // greenhouse | lever | none
  careersToken     String?
  isDemo           Boolean  @default(true)
  createdAt        DateTime @default(now())
  contacts         Contact[]
  deals            Deal[]
  signals          Signal[]
  engagements      EngagementEvent[]
}

model Contact {
  id         String  @id @default(cuid())
  accountId  String
  account    Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  name       String
  title      String?
  role       String  @default("unknown") // champion | decision_maker | influencer | blocker | unknown
}

model Deal {
  id             String    @id @default(cuid())
  accountId      String
  account        Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  ownerName      String
  valueInr       Int
  stage          String    @default("stalled") // active | stalled | revived | won | lost
  stalledAt      DateTime?
  lastTouchAt    DateTime?
  lane           String    @default("WATCH")   // REVIVE | WARM | WATCH
  priorityScore  Int       @default(0)
  matchScore     Int       @default(0)
  interactions   Interaction[]
  memory         Memory?
  recommendations Recommendation[]
  laneChanges    LaneChange[]
  outcomes       Outcome[]
}

model Interaction {
  id            String   @id @default(cuid())
  dealId        String
  deal          Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)
  channel       String   // email | whatsapp | call | meeting | note
  occurredAt    DateTime
  rawText       String
  normalizedText String
  audioFile     String?
  transcriptCached Boolean @default(false)
  createdAt     DateTime @default(now())
}

model Memory {
  id                    String   @id @default(cuid())
  dealId                String   @unique
  deal                  Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)
  stallCategory         String
  summary               String
  evidenceQuote         String
  evidenceSpeaker       String?
  evidenceDate          DateTime?
  evidenceInteractionId String?
  evidenceVerified      Boolean  @default(true)
  timingJson            String   // {text, resolved_date, event_trigger}
  competitorJson        String   // {name, contract_end_date}
  missingFeatureJson    String   // {description, feature_key}
  stakeholdersJson      String
  commitmentsJson       String
  sentiment             String
  language              String
  confidence            Float
  editedByUser          Boolean  @default(false)
  updatedAt             DateTime @updatedAt
}

model Signal {
  id           String   @id @default(cuid())
  accountId    String
  account      Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  dealId       String?  // for computed per-deal signals
  type         String
  title        String
  detail       String?
  sourceName   String   // "Greenhouse" | "Lever" | "News" | "Computed" | "Campaign"
  sourceUrl    String?
  occurredAt   DateTime
  detectedAt   DateTime @default(now())
  provenance   String   // live | demo | computed | simulated
  stale        Boolean  @default(false)
  rawJson      String?
  dedupeKey    String   @unique
}

model Recommendation {
  id           String   @id @default(cuid())
  dealId       String
  deal         Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)
  signalIdsJson String
  effect       String   // REMOVES | WEAKENS | NEUTRAL
  matchScore   Int
  priorityScore Int
  lane         String
  headline     String
  explanation  String
  scoreBreakdownJson String
  status       String   @default("new") // new | drafted | sent | snoozed | dismissed
  snoozedUntil DateTime?
  isCurrent    Boolean  @default(true)
  createdAt    DateTime @default(now())
  drafts       Draft[]
}

model Draft {
  id               String   @id @default(cuid())
  recommendationId String
  recommendation   Recommendation @relation(fields: [recommendationId], references: [id], onDelete: Cascade)
  channel          String   // whatsapp | email
  subject          String?
  body             String
  whyJson          String
  editedBody       String?
  createdAt        DateTime @default(now())
}

model Campaign {
  id                String   @id @default(cuid())
  stallCategory     String
  name              String
  coreMessage       String
  assetsJson        String   // full CampaignDraft
  targetAccountIdsJson String
  status            String   @default("draft") // draft | launched
  launchedAt        DateTime?
  createdAt         DateTime @default(now())
  engagements       EngagementEvent[]
}

model EngagementEvent {
  id          String   @id @default(cuid())
  campaignId  String
  campaign    Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  accountId   String
  account     Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  type        String   // ad_click | post_engagement | landing_visit | email_click
  roleTitle   String?  // anonymized, e.g. "Engineering Manager"
  occurredAt  DateTime @default(now())
  isSimulated Boolean  @default(true)
}

model LaneChange {
  id        String   @id @default(cuid())
  dealId    String
  deal      Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)
  fromLane  String
  toLane    String
  reason    String
  createdAt DateTime @default(now())
  seen      Boolean  @default(false)
}

model Outcome {
  id               String   @id @default(cuid())
  dealId           String
  deal             Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)
  recommendationId String?
  stallCategory    String
  signalType       String?
  event            String   // sent | replied | meeting | won | no_response
  isSeeded         Boolean  @default(false)
  occurredAt       DateTime @default(now())
}

model LlmCache {
  key       String   @id   // sha256(model + system + user + schemaName)
  model     String
  response  String
  createdAt DateTime @default(now())
}

model SourceCache {
  key       String   @id   // e.g. "greenhouse:stripe"
  response  String
  fetchedAt DateTime @default(now())
}
```

---

## 10. API (Next.js route handlers, `src/app/api/...`)

All responses are JSON `{ ok: true, data } | { ok: false, error: { code, message } }`. Validate inputs with zod.

| Method & path | Purpose | Priority |
|---|---|---|
| `GET /api/brief` | KPIs + REVIVE recs (sorted) + WARM rows + WATCH count | P0 |
| `GET /api/accounts` | List with deal, memory summary, lane, latest signal | P0 |
| `POST /api/accounts` | Create account + stalled deal (+ optional careers board) | P0 |
| `GET /api/accounts/[id]` | Full Account Brain payload (account, deal, memory, timeline, signals, current rec) | P0 |
| `POST /api/careers/test` | Test a Greenhouse/Lever token → count of roles | P0 |
| `POST /api/capture/parse` | Parse WhatsApp text → messages preview | P0 |
| `POST /api/capture` | Create interaction → extract → save memory → match deal → return memory + rec | P0 |
| `POST /api/transcribe` | Multipart audio → transcript (`cached` flag) | P1 |
| `PATCH /api/memory/[dealId]` | User correction → re-match | P1 |
| `POST /api/signals/run` | Body `{accountId?}`; runs collectors + matcher; streams progress (SSE or returns step log) | P0 |
| `POST /api/match/run` | Body `{dealIds?}`; re-run matcher; returns lane changes | P0 |
| `POST /api/recommendations/[id]/draft` | Body `{channel, tone}` → Draft | P0 |
| `PATCH /api/recommendations/[id]` | Status: sent / snoozed / dismissed | P0 |
| `GET /api/insights/objections` | Counts, ₹, quotes, accounts by category | P0 |
| `POST /api/campaigns` | Body `{stallCategory}` → generate campaign | P0 |
| `GET /api/campaigns/[id]` | Campaign + stats | P0 |
| `POST /api/campaigns/[id]/launch` | Simulated launch; mark targets WARM | P0 |
| `POST /api/demo/simulate-engagement` | Body `{campaignId?, plan?}` → events → signals → match → lane changes | P0 |
| `GET /api/lane-changes?unseen=1` / `PATCH` | Toast feed | P0 |
| `POST /api/outcomes` | Record outcome | P1 |
| `GET /api/loop` | Funnel + learning table + campaign impact | P1 |
| `POST /api/audit` | CSV → audit report (also `POST /api/audit/import`) | P1 |
| `GET/PUT /api/settings/seller` | Seller profile + changelog (changelog add → FEATURE_SHIPPED → match) | P1 |
| `POST /api/demo/reset` | Wipe DB (keep LlmCache + SourceCache) → reseed → run matcher | P0 |

---

## 11. Tech stack and project structure

### 11.1 Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js (latest stable, App Router) + TypeScript** | One codebase for UI and API; fast for Claude Code |
| UI | **Tailwind CSS + shadcn/ui** (+ `lucide-react` icons) | Fast, consistent, easy to theme with the provided design system |
| Charts | **Recharts** | Simple bar/funnel charts |
| DB | **SQLite + Prisma** | Zero setup, file-based, easy reset |
| Validation | **zod** + `zod-to-json-schema` | Shared schemas for API and LLM tools |
| LLM | **Anthropic SDK** (`@anthropic-ai/sdk`) | Structured extraction, reasoning, copy |
| Transcription | `openai` npm client against OpenAI or Groq (OpenAI-compatible) | Multilingual Whisper |
| RSS | `rss-parser` | Google News RSS (P1) |
| CSV | `papaparse` | Pipeline Audit (P1) |
| Dates | `date-fns` + `date-fns-tz` | IST display, relative dates |
| Tests | **Vitest** (unit) + one Playwright smoke test (golden path, P1) | Confidence before demo |

### 11.2 Environment variables (`.env.local`, never committed; provide `.env.example`)

```
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=
LLM_MODEL_SMART=claude-sonnet-5            # extraction, drafts, campaigns
LLM_MODEL_FAST=claude-haiku-4-5-20251001   # match verification
LLM_OFFLINE=false        # true = cache-only; on cache miss use fallbacks
TRANSCRIBE_PROVIDER=none # openai | groq | none
OPENAI_API_KEY=
GROQ_API_KEY=
DEMO_TODAY=              # optional ISO date to freeze "today" for a deterministic demo (e.g. 2026-10-04)
```

`DEMO_TODAY`: every engine gets "today" from `src/lib/clock.ts` (`now()`), which returns `DEMO_TODAY` if set. This keeps the seed's relative dates stable on demo day.

### 11.3 LLM wrapper (`src/lib/llm.ts`) (P0)

```ts
callStructured<T>({
  model: "smart" | "fast",
  system: string,
  user: string,
  schema: ZodSchema<T>,
  schemaName: string,     // tool name, e.g. "save_revenue_memory"
  maxTokens?: number,     // default 1500
}): Promise<{ data: T; cached: boolean }>
```
- Build the tool from the zod schema; call `messages.create` with `tools: [tool]` and `tool_choice: { type: "tool", name: schemaName }`; read the `tool_use` block's `input`; validate with zod.
- **Cache:** key = sha256(model + system + user + schemaName). Read before calling; write after success.
- `LLM_OFFLINE=true` → cache only; on miss throw `LlmOfflineMiss` (callers use fallbacks).
- Timeout 45s; 2 retries with backoff on 429/5xx/timeouts; on zod failure, one retry that appends the validation error to the user message.
- Log duration, model, cached flag (console in dev).

### 11.4 Project structure

```
rekindle/
  prisma/
    schema.prisma
    seed.ts                      # reads demo/seed/*.json
  demo/
    seed/
      seller.json
      accounts.json              # 20 accounts + contacts + deals
      interactions.json          # conversations per deal
      memories.json              # precomputed extraction fallback
      signals.json               # seeded news/hiring for demo companies
      outcomes_history.json      # 60 seeded outcomes (P1)
    conversations/               # sample files for Capture
      finvara_whatsapp.txt
      kredo_call_transcript.txt
      mediloop_email.txt
      ledgerline_email.txt
      tripnest_whatsapp.txt
      live_account_whatsapp.template.txt
    audio/
      kredo_voice_note.m4a       # recorded by the team (script in §12.3)
    transcripts/
      kredo_voice_note.txt       # cached transcript fallback
    pipeline_export.csv          # P1 audit sample
  public/
    logo.svg                     # provided by team
  src/
    app/
      layout.tsx  page.tsx (Today)
      accounts/page.tsx  accounts/[id]/page.tsx
      capture/page.tsx
      insights/page.tsx
      loop/page.tsx  audit/page.tsx  settings/page.tsx
      api/...                    # see §10
    components/
      shell/ (Sidebar, Header, DemoControlsDrawer, LaneToasts)
      brief/ (KpiRow, RecommendationCard, WarmList, WatchTable)
      account/ (MemoryCard, Timeline, NextBestAction, DraftComposer, SignalList)
      capture/ (AccountPicker, PasteTab, WhatsAppTab, VoiceTab, ExtractionResult, HighlightedText)
      insights/ (ObjectionChart, ObjectionPanel, CampaignView, AdCard, LinkedInPostMock, LandingHeroMock)
      ui/ (shadcn)
    lib/
      db.ts  clock.ts  llm.ts  format.ts (INR lakh/crore, dates)  schemas.ts
      parsers/whatsapp.ts
      transcribe.ts
      prompts/ (extract.ts, match.ts, draft.ts, campaign.ts)
      engines/
        extract.ts
        signals/ (greenhouse.ts, lever.ts, news.ts, computed.ts, engagement.ts, index.ts)
        match.ts  (matrix, scoring, lanes)
        draft.ts
        campaign.ts
        engagement.ts (reverse intent)
      services/ (capture.ts, brief.ts, account.ts, insights.ts, demo.ts)
    tests/ (whatsapp.test.ts, match.test.ts, format.test.ts)
  scripts/
    warm-cache.ts               # runs every LLM call in the golden path once
    check-boards.ts             # verifies candidate Greenhouse/Lever tokens
  .env.example  README.md
```

### 11.5 npm scripts

```
"dev": "next dev",
"build": "next build",
"db:push": "prisma db push",
"seed": "tsx prisma/seed.ts",
"demo:reset": "prisma db push --force-reset && tsx prisma/seed.ts && tsx scripts/run-matcher.ts",
"demo:warm": "tsx scripts/warm-cache.ts",
"boards:check": "tsx scripts/check-boards.ts",
"test": "vitest run"
```
Note: `demo:reset` must **not** delete the `LlmCache` and `SourceCache` tables' content. Either store caches in a separate SQLite file (`cache.db`, recommended, via a second lightweight client such as `better-sqlite3`) or back them up and restore them in the reset script.

### 11.6 Formatting utilities (`src/lib/format.ts`)

- `formatINR(18_00_000)` → `₹18 L`; `formatINR(2_40_00_000)` → `₹2.4 Cr`; under 1 lakh → `₹85,000` (Indian grouping).
- Relative dates: "3 days ago", and absolute "14 Mar" (add year if not the current year).
- Unit tests for both.

---

## 12. Seed data (demo workspace)

All companies and people below are **fictional**. Show a `Demo data` badge on them. "Today" for the demo is `DEMO_TODAY=2026-10-04` (set it; adjust to the actual demo date if different and keep relative gaps).

### 12.1 Seller: CloudKavach (fictional)

```json
{
  "name": "CloudKavach",
  "oneLiner": "Cloud security and compliance automation (SOC 2, ISO 27001) for Indian SaaS and fintech teams.",
  "product": "Continuous cloud security posture monitoring plus automated SOC 2 / ISO 27001 evidence collection and audit readiness.",
  "icp": "Indian SaaS, fintech and healthtech companies, 50–2,000 employees, selling to enterprises that demand compliance.",
  "personas": ["CTO", "VP Engineering", "Head of Security", "Compliance Head"],
  "proofPoints": [
    "Median onboarding time: 14 days from kickoff to first audit-ready report (internal customer data, 2026)",
    "One-click AWS, GCP and Azure connectors; no agents to install",
    "Pre-mapped controls for SOC 2 Type II, and ISO 27001 Annex A since Sept 2026",
    "Dedicated onboarding engineer for the first 30 days",
    "Pricing in INR with quarterly billing"
  ],
  "roleKeywords": ["security","devsecops","appsec","infosec","compliance","grc","soc","cloud","infrastructure","sre","platform","devops","risk","audit","ciso"],
  "changelog": [
    { "date": "2026-08-10", "title": "One-click cloud connectors (setup in under 15 minutes)", "featureKey": "fast_onboarding" },
    { "date": "2026-09-22", "title": "ISO 27001 Annex A control mapping", "featureKey": "iso27001_mapping" },
    { "date": "2026-07-01", "title": "RBI cyber-security framework report pack", "featureKey": "rbi_reporting" }
  ],
  "repName": "Ananya Rao"
}
```

### 12.2 The 20 stalled deals

| # | Account (fictional) | Industry · City | Deal ₹ | Stall category | Contact (title) | Channel · date of stall | Seeded/computed signal | Expected lane (before campaign) |
|---|---|---|---|---|---|---|---|---|
| 1 | **Finvara Pay** | Fintech · Bengaluru | 22 L | BUDGET | Rohan Kapoor (VP Engineering) | WhatsApp · 14 Mar 2026 | FUNDING: "Finvara Pay raises ₹180 Cr Series B led by Northbridge Ventures" · 24 Sep 2026 | **REVIVE** |
| 2 | **Kredo Lending** | Fintech · Mumbai | 15 L | NO_OWNER | Meera Iyer (CTO) | Call · 2 Apr 2026 | HIRING_RELEVANT: Security Lead, Cloud Security Engineer, DevSecOps Engineer · 18–29 Sep | **REVIVE** |
| 3 | **MediLoop Health** | Healthtech · Pune | 18 L | COMPETITOR_LOCKIN | Arjun Shah (Head of IT) | Email · 20 Jan 2026 | Computed RENEWAL_WINDOW: SecureGrid contract ends 15 Dec 2026 | **REVIVE** |
| 4 | **Ledgerline** | Fintech SaaS · Chennai | 12 L | MISSING_FEATURE (`iso27001_mapping`) | Priya Nair (Compliance Head) | Email · 5 May 2026 | Computed FEATURE_SHIPPED: changelog 22 Sep 2026 | **REVIVE** |
| 5 | **Spendwise** | Expense SaaS · Gurugram | 9 L | TIMING ("after Q2 closes" → 2026-10-01) | Aditya Bose (VP Engineering) | Email · 12 Jun 2026 | Computed DATE_REACHED | **REVIVE** |
| 6 | **Tripnest** | Travel tech · Bengaluru | 16 L | IMPLEMENTATION_EFFORT | Karan Malhotra (Head of Engineering) | WhatsApp · 21 May 2026 | none (until campaign engagement) | WATCH → WARM → **REVIVE** |
| 7 | Zestcart | D2C platform · Delhi | 11 L | IMPLEMENTATION_EFFORT | Sana Qureshi (CTO) | Email · 3 Jun 2026 | none (until campaign engagement) | WATCH → WARM → **REVIVE** |
| 8 | Edunova | Edtech · Hyderabad | 8 L | IMPLEMENTATION_EFFORT | Rahul Verma (Eng Manager) | Call · 10 Jul 2026 | none (1 engagement only) | WATCH → WARM |
| 9 | Quickship Logistics | Logistics SaaS · Ahmedabad | 10 L | IMPLEMENTATION_EFFORT | Neeraj Patel (VP Tech) | Email · 18 Apr 2026 | none | WATCH → WARM |
| 10 | Retailo | Retail SaaS · Bengaluru | 7 L | IMPLEMENTATION_EFFORT | Divya Menon (Platform Lead) | WhatsApp · 2 Jul 2026 | none | WATCH → WARM |
| 11 | InsureNest | Insurtech · Mumbai | 10 L | IMPLEMENTATION_EFFORT | Faisal Khan (CTO) | Call · 28 Jun 2026 | none | WATCH → WARM |
| 12 | Paywise | Payments · Noida | 14 L | BUDGET | Ishita Jain (Finance Controller) | Email · 9 Jul 2026 | none | WATCH |
| 13 | Farmlink Agritech | Agritech · Indore | 6 L | BUDGET | Suresh Reddy (CTO) | WhatsApp · 15 May 2026 | EXPANSION: "Farmlink expands to 4 new states" · 2 Sep 2026 | **WARM** |
| 14 | Kirana Cloud | Retail tech · Jaipur | 5 L | BUDGET | Mohit Agarwal (Founder) | Call · 30 Jun 2026 | none | WATCH |
| 15 | MediQuick | Healthtech · Kochi | 9 L | NO_OWNER | Anjali Thomas (VP Engineering) | Email · 22 May 2026 | HIRING_RELEVANT: "DevOps Engineer" (1 role) · 1 Jul 2026 (old, single role → weakens) | **WARM** |
| 16 | Hirewell | HR tech · Bengaluru | 7 L | NO_OWNER | Varun Sethi (CTO) | WhatsApp · 1 Aug 2026 | none | WATCH |
| 17 | CloudBazaar | B2B marketplace · Mumbai | 13 L | COMPETITOR_LOCKIN | Pooja Desai (Head of Infra) | Email · 14 Jul 2026 | Computed: contract ends Jun 2027 (not yet) | WATCH |
| 18 | Urbanmile | Mobility · Pune | 8 L | TIMING ("let's talk in January" → 2027-01-05) | Nikhil Rao (VP Engineering) | Call · 19 Aug 2026 | none | WATCH |
| 19 | Bharat Freight | Logistics · Delhi | 12 L | CHAMPION_LEFT | (former) Rakesh Gupta → now unknown | Email · 7 Apr 2026 | LEADERSHIP_CHANGE: "Bharat Freight appoints new CTO" · 20 Jun 2026 (old → weakens) | **WARM** |
| 20 | Nimbus HR | HR SaaS · Chandigarh | 6 L | WENT_DARK | Tanvi Kulkarni (Eng Manager) | Email · 25 Mar 2026 | none | WATCH |

- Totals: **₹2.18 Cr** (approximately; compute dynamically, don't hardcode in UI). Initial REVIVE = 5 deals (#1–5). IMPLEMENTATION_EFFORT = 6 deals (30%), the top objection.
- **Simulated engagement plan (default):** Tripnest ×3 (Engineering Manager, Platform Engineer, Head of Engineering), Zestcart ×3, Edunova ×1. Expected result: Tripnest and Zestcart → REVIVE; Edunova stays WARM.
- Each deal has 1–2 interactions. For deals 7–20, Claude Code writes short realistic conversations (4–10 messages or a 6–12 line email/call excerpt) that clearly express the stall category in the table, ~40% with natural Hinglish on WhatsApp/calls. Also write the matching `memories.json` (precomputed extraction) so the app works with no API key.
- `lastTouchAt` = stall date; `stalledAt` = stall date.

**Verify after seeding + matcher (acceptance test):** lanes match the "Expected lane" column; Finvara is #1 on Today; Tripnest is WATCH before the campaign and REVIVE after simulated engagement. The seed values and signal dates above were chosen so the scoring rules in §7.5 produce exactly these lanes even when the LLM verdict varies. If a lane is off, **adjust seed dates/values, not the scoring rules**.

### 12.3 Hero conversations (write these exact files)

**`demo/conversations/finvara_whatsapp.txt`** (Android export format)
```
14/03/26, 10:58 am - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
14/03/26, 11:02 am - Ananya Rao: Hi Rohan, thanks for the call yesterday! Sharing the SOC 2 readiness checklist we discussed.
14/03/26, 11:02 am - Ananya Rao: <Media omitted>
14/03/26, 11:20 am - Rohan Kapoor: Thanks Ananya. Honestly product is solid, team ko demo kaafi pasand aaya.
14/03/26, 11:21 am - Rohan Kapoor: But abhi budget nahi hai. We're closing our Series B, tab tak new tooling spend pe freeze hai.
14/03/26, 11:22 am - Rohan Kapoor: Ping me once the round closes, we'll definitely revisit. SOC 2 is on the roadmap for our enterprise clients anyway.
14/03/26, 11:25 am - Ananya Rao: Totally understand. I'll reconnect after the round. All the best with the raise!
14/03/26, 11:26 am - Rohan Kapoor: 👍
```

**`demo/conversations/kredo_call_transcript.txt`** (also the script the team records as `kredo_voice_note.m4a`, ~40 seconds)
```
Call notes — Kredo Lending — 2 April 2026
Ananya: Meera, thanks for taking the time. Where did the team land after the demo?
Meera Iyer (CTO): Dekho, product accha hai, no doubt. The problem is we don't have anyone owning security right now.
Meera: Mera infra team already stretched hai, and if we buy a tool with no owner, it'll become shelfware.
Meera: Once we hire a dedicated security lead, that person should evaluate this. We're hoping to start hiring by Q3.
Ananya: That makes sense. Should I send over the RBI framework report pack in the meantime?
Meera: Haan, send it. And keep in touch.
```

**`demo/conversations/mediloop_email.txt`**
```
From: Arjun Shah <arjun@mediloop.example>
To: Ananya Rao <ananya@cloudkavach.example>
Date: 20 Jan 2026
Subject: Re: CloudKavach proposal

Hi Ananya,

Thanks for the detailed proposal, and the team liked the audit-readiness dashboard.

Unfortunately we signed a one-year contract with SecureGrid in December, and it runs till 15 December 2026. Breaking it isn't an option for us.

Do reach out about two months before the renewal. We'll be reviewing alternatives then, and honestly their reporting has been weak.

Regards,
Arjun Shah
Head of IT, MediLoop Health
```

**`demo/conversations/ledgerline_email.txt`**
```
From: Priya Nair <priya@ledgerline.example>
Date: 5 May 2026
Subject: Re: Follow-up on CloudKavach evaluation

Hi Ananya,

We've completed the evaluation. The SOC 2 workflow is great, but our auditors require ISO 27001 Annex A control mapping, not just SOC 2. Without that, I can't justify a second tool to our CFO.

If ISO 27001 support lands on your roadmap, please let me know. We'd move quickly.

Best,
Priya
```

**`demo/conversations/tripnest_whatsapp.txt`**
```
21/05/26, 4:10 pm - Ananya Rao: Hi Karan, following up on last week's demo. Any thoughts from the team?
21/05/26, 4:32 pm - Karan Malhotra: Hey Ananya. Team liked it, but honestly we're scarred.
21/05/26, 4:33 pm - Karan Malhotra: Last time we tried a compliance tool, onboarding took 4 months and pulled 2 engineers off the roadmap.
21/05/26, 4:33 pm - Karan Malhotra: We can't afford that again this year. If it isn't plug and play, it's a no for now.
21/05/26, 4:40 pm - Ananya Rao: Fair concern. Our onboarding is much lighter, happy to show you how.
21/05/26, 4:41 pm - Karan Malhotra: Maybe later in the year. Let's park it for now.
```

**`demo/conversations/live_account_whatsapp.template.txt`** (replace `{{COMPANY}}` with the live company's name before the demo)
```
08/06/26, 12:15 pm - Ananya Rao: Hi Dev, thanks for the call! Sharing the deck as promised.
08/06/26, 12:40 pm - Dev Sharma: Thanks. Product looks great for {{COMPANY}}, but right now nobody on our side owns security or compliance.
08/06/26, 12:41 pm - Dev Sharma: Once we hire people into security or platform roles, they'd be the ones to evaluate this. Not before that.
08/06/26, 12:45 pm - Ananya Rao: Understood, I'll keep in touch.
```

### 12.4 The live account (P0, for the "it's real" moment)

- Run `npm run boards:check` the day of the demo. The script tries a list of candidate board tokens on Greenhouse and Lever, prints which ones respond and how many **relevant** roles each has (using the seller keywords), and recommends the best.
- Candidates to try (verify; don't assume they exist): Indian-founded or India-hiring tech companies first (e.g., `postman`, `browserstack`, `razorpay`, `cred`, `groww`, `zeta`, `freshworks`, `chargebee`, `druva`, `hasura`), then global fallbacks with large boards (e.g., `stripe`, `gitlab`, `airbnb`, `databricks`). Include both providers for each token.
- Pick one with **≥ 2 relevant roles**. During the demo: Add Account (name + provider + token) → paste the template WhatsApp (with `{{COMPANY}}` replaced; the contact "Dev Sharma" is fictional) → Run signal check → real jobs appear with real links → deal moves to REVIVE (NO_OWNER × HIRING_RELEVANT).
- The real company gets the `Live` badge on signals; the conversation stays labelled `Demo data` (it's fictional). Say this out loud in the demo.
- Pre-fetch once before the demo so `SourceCache` has a fallback if the venue Wi-Fi fails.

### 12.5 Seeded history (P1)

`outcomes_history.json`: 60 past recommendations with `stallCategory`, `signalType`, and an outcome sequence. Target rates: BUDGET×FUNDING 41% reply / 24% meeting; NO_OWNER×HIRING_RELEVANT 37% / 20%; IMPLEMENTATION_EFFORT×CAMPAIGN_ENGAGEMENT 33% / 18%; TIMING×DATE_REACHED 22% / 9%; WENT_DARK×any 8% / 2%. Mark `isSeeded = true`.

---

## 13. Reliability, performance and demo safety

1. **LLM cache everywhere** (§11.3). `npm run demo:warm` executes the whole golden path's LLM calls (extraction for all hero files, match verifications for initial REVIVE deals, drafts for the top 5 in both channels, the IMPLEMENTATION_EFFORT campaign, post-engagement verifications). After warming, set `LLM_OFFLINE=true` for a fully offline demo.
2. **Precomputed fallbacks:** if extraction misses the cache offline, use `demo/seed/memories.json` for known sample files (match by file hash). Drafts fall back to a templated message. Campaigns fall back to `demo/seed/campaign_implementation.json` (generated during warm-up and committed).
3. **Live source fallback:** `SourceCache` returns the last good response if a live fetch fails; signals are marked `stale` (small grey "cached" label).
4. **Deterministic clock:** `DEMO_TODAY`.
5. **Performance budgets:** Today loads < 500ms (local DB); cached LLM calls < 50ms; uncached extraction < 15s, with progress UI; matcher for 20 deals < 300ms excluding LLM; signal check (live) < 10s with per-source progress.
6. **Concurrency:** batch LLM calls with a concurrency limit of 4.
7. **Errors never dead-end:** every failure shows a plain-English message plus Retry, and keeps user input.
8. **No secrets in the client.** All LLM/transcription calls run server-side.

---

## 14. Design guidelines

- **Use the provided design system and logo.** Map its tokens to Tailwind CSS variables (`--background`, `--foreground`, `--primary`, `--accent`, etc.) in `globals.css`; shadcn/ui components consume them.
- If a token is missing, use these defaults:
  - Lane colours: `REVIVE` = brand primary / ember (warm orange-red), `WARM` = amber, `WATCH` = neutral slate.
  - Evidence block: "They said" on a subtle neutral surface with a left border; "What changed" on a subtle accent surface; a small downward arrow between them.
  - Badges: `Live` (green dot), `Demo data` (neutral outline), `Simulated` (dashed outline), `Computed` (subtle), `Cached` (grey).
- **Typography:** big, confident numbers in KPI tiles; the recommendation headline is the most prominent text on a card; quotes in a slightly larger italic or quote style.
- **Motion (subtle):** toast slide-in; when a deal moves lanes, the card animates into the Revive list with a short glow (the "rekindle" moment). Respect `prefers-reduced-motion`.
- **Copy voice:** plain, specific, human. Use "Revive now", "Warming up", "Watching". Avoid "AI-powered", "magic", "leverage". Always show "why".
- **Accessibility:** colour is never the only signal (lane chips have text); visible focus states; contrast AA.
- **Projector-proof:** test at 1280×720 and 125% zoom; minimum body text 14px.

---

## 15. Build plan (milestones with acceptance criteria)

Build sequentially if a single Claude Code session is running. If the team runs parallel sessions, use the suggested tracks. **After each milestone: run `npm run build`, `npm test`, and click through the golden path.**

### M0: Scaffold (≈1h)
- Next.js + TS + Tailwind + shadcn/ui + Prisma (SQLite) + Vitest. `.env.example`. Logo in the sidebar.
- App shell with all nav routes (placeholder pages), header with Demo mode badge and buttons.
- `clock.ts`, `format.ts` (+ tests).
- ✅ *Accept:* `npm run dev` shows the shell; INR formatting tests pass.

### M1: Data and seed (≈1.5h)
- Prisma schema (§9). Separate cache DB.
- Seed JSON for seller, 20 accounts/contacts/deals, interactions (all 20 conversations), precomputed memories, seeded signals. Hero conversation files (§12.3).
- `demo:reset` script.
- ✅ *Accept:* `npm run demo:reset` populates everything; Prisma Studio shows 20 deals with memories and signals.

### M2: Matcher + Today + Account Brain on seeded data (≈3h) ← first demoable version
- Computed signals (date, renewal, changelog). Rule-based matcher, scoring, lanes, LaneChange (LLM verification stubbed to fallback for now).
- `/api/brief`, `/api/accounts`, `/api/accounts/[id]`.
- Today screen (KPIs, Revive cards with evidence, Warm list, Watch table). Accounts list. Account Brain (memory card, timeline, signals, next best action without draft).
- ✅ *Accept:* lanes match §12.2; Finvara is #1; every Revive card shows quote ↔ signal evidence; matcher unit tests pass.

### M3: LLM wrapper + Capture + Extraction (≈3h)
- `llm.ts` with cache/offline/retries. Extraction prompt + schema + evidence verification + merge.
- WhatsApp parser + tests. Capture page with sample buttons, parse preview, 3-step progress, highlighted evidence, save → re-match → result.
- Wire LLM match verification into the matcher (with fallback).
- ✅ *Accept:* uploading `finvara_whatsapp.txt` produces BUDGET with the Hinglish quote highlighted; offline mode with an empty cache falls back to precomputed memory; WhatsApp tests pass (Android, iOS, multi-line, ` `).

### M4: Live signals + Add Account + Run signal check (≈2h)
- Greenhouse and Lever collectors with relevance filtering, SourceCache fallback, dedupe. Add Account modal with **Test** button. `/api/signals/run` with step progress. Lane-change toasts.
- `scripts/check-boards.ts`.
- ✅ *Accept:* adding a real board plus the live template conversation → real jobs appear with links → deal moves to REVIVE with a toast. Turning off the network still works using the cache (marked cached).

### M5: Drafts (≈1.5h)
- Draft engine and prompt; Draft panel (Today) and inline composer (Account Brain); channel toggle; Copy; Mark as sent (status + outcome).
- ✅ *Accept:* Finvara's WhatsApp draft references March and the Series B, ≤ 70 words, one ask, no "detected/tracked". Email draft has a subject line.

### M6: Insights + Campaigns + Reverse intent (≈3h)
- Objection aggregation + chart + panel with quotes. Campaign engine and prompt; Campaign view with LinkedIn post mock, 3 ad cards, email, landing hero mock, target audience. Simulated launch (targets → WARM).
- Demo Controls drawer; simulate engagement → events → CAMPAIGN_ENGAGEMENT signals → re-match → toasts → Tripnest and Zestcart in REVIVE with campaign evidence.
- ✅ *Accept:* full Scenes 4–5 of §4 work end-to-end; campaign uses only proof points (spot-check: no invented customers/numbers); ad text respects length limits.

### M7: Demo hardening (≈1.5h)
- `demo:warm` script; committed campaign fallback JSON; `LLM_OFFLINE` path tested end-to-end.
- Visual polish pass: spacing, empty/loading/error states, lane-change glow, 1280×720 check.
- README with setup, env vars, demo steps.
- ✅ *Accept:* with `LLM_OFFLINE=true` and Wi-Fi off, the golden path (except the live board fetch, which uses its cache) runs start to finish twice after `demo:reset` with zero errors.

### M8: P1 features (only after M7 passes)
Order: **(1)** Voice note transcription with cached fallback → **(2)** Revenue Loop screen + outcome buttons + seeded history → **(3)** Pipeline Audit → **(4)** Settings with changelog trigger → **(5)** Memory correction → **(6)** Live news RSS.

### Suggested parallel tracks (if 3 people each run Claude Code)
- **Track A (Core):** M0 → M1 → M2 → M5.
- **Track B (Intelligence):** M3 (LLM wrapper, extraction, WhatsApp parser) → M4 (signals).
- **Track C (Growth):** seed conversation writing (M1 content) → M6 (campaigns, reverse intent) → P1 Revenue Loop.
- Agree on `schemas.ts` and `schema.prisma` first (Track A owns them), then merge often.

---

## 16. Testing and demo checklist

### 16.1 Automated
- Vitest: WhatsApp parser (8+ cases), matcher (matrix, freshness, pre-evidence exclusion, lanes, campaign rule, fallback), INR format, evidence verification (exact, fuzzy, not found).
- P1: Playwright smoke test of the golden path in offline mode.

### 16.2 Manual QA (before the demo)
- [ ] `npm run demo:reset` then `npm run demo:warm` (online), then set `LLM_OFFLINE=true` and restart.
- [ ] `npm run boards:check`; choose the live board; prepare the live template with the company name; pre-fetch once.
- [ ] Today: 5 in Revive, Finvara #1, KPIs correct, evidence on every card.
- [ ] Capture: Finvara WhatsApp + Kredo call/voice → correct categories, quotes highlighted.
- [ ] Drafts: top 5, both channels, read every one for tone and accuracy.
- [ ] Campaign: read every asset; no invented facts; lengths OK.
- [ ] Simulate engagement: Tripnest and Zestcart move to Revive with toasts.
- [ ] 1280×720 and 125% zoom look right on the actual projector/laptop.
- [ ] Record a **backup screen recording** of the full golden path.
- [ ] Reset to the clean state right before presenting.

---

## 17. Guardrails (privacy, trust, honesty)

1. **No personal data collection.** Signals come from public company sources (job boards, company news). No scraping of LinkedIn or personal profiles. Engagement events store anonymized role titles only.
2. **Customer-provided conversations** are processed as a data processor for the customer (say this in the pitch; DPDP-aligned roadmap: retention controls, deletion, India data residency).
3. **Human in the loop:** no auto-sending; no real ad launches.
4. **Honest labels:** `Demo data`, `Simulated`, `Seeded history`, `Cached` everywhere they apply.
5. **No fabricated proof:** campaigns and drafts use only seller-provided facts; placeholders otherwise.
6. **Secrets:** API keys only in `.env.local`, server-side only, never logged.

---

## 18. Defaults for open decisions

| Question | Default |
|---|---|
| Auth / multi-user | None. Single demo workspace, single rep "Ananya Rao". |
| Currency / locale | INR, `en-IN`, Indian digit grouping, `Asia/Kolkata`. |
| Which contact gets the draft | Champion; else decision maker; else the evidence speaker. |
| Multiple stalled deals per account | One deal per account in the hackathon build. |
| Signal lookback window | 180 days (freshness rules apply). |
| Snooze | 7 days; snoozed recs hidden from Today. |
| Dismiss | Hides the recommendation until a new signal arrives. |
| Campaign target minimum | None in the demo; show the matched-audience note. |
| Ad images | Branded gradient placeholder with the headline (P2: generated image). |
| Model choice | `LLM_MODEL_SMART` for extraction/drafts/campaigns; `LLM_MODEL_FAST` for match verification. Both configurable. |

---

## 19. How the build maps to the pitch deck

| Deck slide | What to show in the product |
|---|---|
| Problem | Today KPI: "₹2.2 Cr dormant pipeline" |
| Solution (Find → Sell → Market → Learn) | Today (Revive/Warm/Watch), Capture, Campaigns, Revenue Loop |
| Tech | Capture's live extraction + live Greenhouse/Lever signal check |
| USP | Evidence block (quote ↔ signal); campaign built from objections; reverse-intent toast |
| Impact | Revive count and ₹, Pipeline Audit report (P1) |
| Business model | Pipeline Audit as the free tier → paid workspace |

---

*End of spec. Build the golden path first, keep it working after every step, and label anything simulated.*
