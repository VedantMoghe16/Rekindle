# Rekindle

Rekindle is an AI revenue teammate for B2B sales teams. It finds companies ready to buy now, remembers why every deal stalled, notices when that reason stops being true, turns real buyer objections into LinkedIn and X campaigns, and learns which signals and messages actually reopen deals.

Built by Team Yaytm for the Paytm Build for India AI Hackathon (Autonomous AI Teammates track).

## Four jobs, one loop

| Job | Where | What it does |
|---|---|---|
| **Find** | Find accounts, Leads | Compiles a plain-English ICP into a research plan, then ranks a curated registry of real Indian B2B companies by fit and live timing evidence from Greenhouse, Lever and Google News. Every score cites its source. |
| **Sell** | Today, Conversations, Account Brain | Extracts the stall reason from WhatsApp exports, emails, calls and Hinglish voice notes, verifies the quote verbatim, matches it against new signals, ranks who to contact today, flags deals going cold, and drafts the message in English or Hinglish. |
| **Market** | Insights & Campaigns | Aggregates objections across the pipeline, recommends a channel, generates a LinkedIn post, X thread, nurture email and landing hero from what buyers actually said, and publishes through n8n after human approval. |
| **Learn** | Revenue Loop | Engagement from target accounts becomes a sales signal. Outcomes show which stall reason × signal combinations reopen deals. |

## Sponsor integrations

| Provider | Used for | Without a key |
|---|---|---|
| **Claude** (`claude-opus-5-5`, `claude-haiku-4-5`) | ICP compilation, lead fit scoring, memory extraction, drafts, campaigns | Cached responses, then deterministic rules and templates |
| **Cognee** | Long-horizon memory graph over every conversation, memory and signal; "Ask the pipeline" | Local lexical search over the same records |
| **Sarvam** | `saaras:v3` codemix speech-to-text for Hinglish voice notes; `sarvam-105b` for Hinglish drafts | Cached transcript for the bundled sample; Claude or templates for drafts |
| **n8n** | Publishing campaigns to LinkedIn and X, scheduled signal collection, engagement callbacks | Simulated launch with a `Simulated` badge |

Every result shows where it came from: Claude, Cached, Rules, Template, Live, Simulated or Demo data. The Demo controls drawer shows which providers are live.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env
npm run demo:reset
npm run dev
```

Open `http://localhost:3000`. Product time is frozen at 4 October 2026 (`DEMO_TODAY`).

### Turn providers on

Add keys to `.env`, set `LLM_OFFLINE=false`, and restart `npm run dev`.

```bash
# Cognee, self-hosted
docker run -d -p 8000:8000 --env-file cognee.env cognee/cognee:main
# then in .env: COGNEE_BASE_URL=http://localhost:8000
# Cognee Cloud instead: COGNEE_BASE_URL=https://<tenant>.aws.cognee.ai and COGNEE_API_KEY=...

# Sarvam voice notes
SARVAM_API_KEY=...
TRANSCRIBE_PROVIDER=sarvam
```

For n8n, import the workflows in `n8n/` and follow `n8n/README.md`, then set `N8N_CAMPAIGN_WEBHOOK_URL`, `N8N_SHARED_SECRET` and a public `APP_BASE_URL` so n8n can call back.

After keys work, run `npm run demo:warm` once. It runs every LLM call on the golden path and stores the responses, so the demo can then run with `LLM_OFFLINE=true` and no network risk.

## Demo script (about 3 minutes)

1. **Find.** Find accounts → keep the sample prompt → Build plan → Approve. Ranked real companies appear with dated hiring and news evidence and source links. Shortlist one.
2. **Remember.** Conversations → Load Finvara WhatsApp → Understand → the Hinglish budget blocker is extracted with the exact quote highlighted → Save. Then Load sample voice note to show Sarvam transcription.
3. **Watch and match.** Today → Run signal check → Finvara Pay is first in Revive because the Series B removed the budget blocker → Generate draft in English or Hinglish → Mark as sent.
4. **Ask the pipeline.** "Which deals are blocked on implementation effort and what did they say?" answers from Cognee with citations.
5. **Market.** Insights & Campaigns → Implementation effort is the top objection → Generate campaign → review the recommended channel, LinkedIn post and X thread → Approve and launch.
6. **Learn.** Demo controls → Simulate campaign engagement → Tripnest and Zestcart move to Revive → Revenue Loop shows the funnel and what revives deals.

Reset between rehearsals with Demo controls → Reset demo data. Warmed caches survive resets.

## Commands

- `npm run dev`: development server
- `npm run build`: production build
- `npm test`: unit tests
- `npm run demo:reset`: reseed the workspace, compute signals, run the matcher
- `npm run demo:warm`: pre-run golden-path LLM calls into the cache
- `npm run boards:check`: verify the public job boards in the company registry

All seeded deals, contacts and conversations are fictional. The company registry in `data/companies.json` lists real companies with public facts only. Rekindle never sends a message on the user's behalf, and campaigns publish only after explicit approval.
