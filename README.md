# Rekindle

Rekindle is a demo AI revenue teammate for B2B sales teams. It remembers why deals stalled, links specific signals to those objections, and ranks the conversations worth reopening.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env
npm run demo:reset
npm run dev
```

Open `http://localhost:3000`. The default environment freezes product time at 4 October 2026 and runs offline.

## Current build

- App shell and all planned routes
- Twenty fictional stalled deals totaling ₹2.18 Cr
- Deterministic rules matcher with 5 Revive, 3 Warm and 12 Watch deals
- Today, Accounts and Account Brain screens
- Offline Capture preview for the Finvara WhatsApp and Kredo call samples
- Evidence highlighting and duplicate-safe cached extraction
- Conversational Find Accounts with a reviewable research plan
- Twelve fictional lead candidates with fit, timing, confidence and retained evidence
- Follow-up chat refinements and duplicate-safe promotion into Account Brain

Provider-backed ICP compilation, live company research, live job signals, drafts and the campaign loop follow in the next milestones. Placeholder pages label features that are not active yet.

## Commands

- `npm run dev` — development server
- `npm run build` — production build
- `npm test` — unit tests
- `npm run demo:reset` — reset app data, seed the workspace, and run the matcher

All demo companies and contacts are fictional. Seeded company news is marked Demo data, computed signals are marked Computed, and Rekindle never sends a message on the user's behalf.
