# Rekindle × n8n

n8n is Rekindle's integration bus. Three workflows live here:

| File | Trigger | What it does |
|---|---|---|
| `campaign-publish.json` | Webhook `POST /webhook/rekindle-campaign` | Checks the shared secret, splits the approved assets, posts to LinkedIn (company page) and X (first post + replies chained into a thread), calls Rekindle back with `post.published` per platform, and responds `{ postUrls }`. |
| `engagement-relay.json` | Every 15 minutes | Lists launched campaigns from Rekindle, fetches reactions/likes for each real post (LinkedIn + X HTTP placeholders), maps engagers to target accounts by company name in their headline/bio, and posts `engagement` events back. Rekindle turns them into `CAMPAIGN_ENGAGEMENT` signals and re-runs the matcher, so engaged accounts move lanes for sales. |
| `signal-collector.json` | Daily 07:00 | Pulls Rekindle accounts, reads Google News RSS per company, keeps fresh headlines that look like buying signals (funding, leadership, hiring, expansion, compliance, launches), and posts them to `/api/signals/ingest`. |

Nothing is posted publicly unless a human clicks **Approve and launch** on `/insights` and confirms the exact copy per platform. Without `N8N_CAMPAIGN_WEBHOOK_URL`, Rekindle launches campaigns as **Simulated** and never calls n8n.

## Setup

1. **Run n8n** (self-hosted or cloud), e.g. `docker run -it --rm -p 5678:5678 -e N8N_SHARED_SECRET=change-me -e APP_BASE_URL=http://host.docker.internal:3000 -e LINKEDIN_ORGANIZATION_ID=12345678 n8nio/n8n`.
   The workflows read `$env.N8N_SHARED_SECRET`, `$env.APP_BASE_URL` and `$env.LINKEDIN_ORGANIZATION_ID`. If your instance blocks env access in nodes (`N8N_BLOCK_ENV_ACCESS_IN_NODE=true`), replace those expressions with literal values.
2. **Import** each JSON file: *Workflows → Import from file*.
3. **Credentials**
   - *LinkedIn account* (`LinkedIn OAuth2 API`): an app with *Share on LinkedIn* and, for company pages, *Community Management API* (`w_organization_social`). In **LinkedIn: create post**, choose *Post As → Organization* with your page id, or switch to *Person* and pick yourself.
   - *X account* (`X OAuth2 API`): an app with `tweet.read tweet.write users.read offline.access`. Reading likers in the relay needs a paid read tier.
   - Open every LinkedIn/X node once and select the credential (imports keep the name but not the secret).
4. **Activate** `campaign-publish` and copy its *Production URL*.
5. **Rekindle env** (`.env`):
   ```bash
   N8N_CAMPAIGN_WEBHOOK_URL=https://your-n8n.example.com/webhook/rekindle-campaign
   N8N_SHARED_SECRET=change-me            # same value n8n sees
   APP_BASE_URL=https://your-rekindle.example.com   # n8n must be able to reach it (use a tunnel for localhost)
   ```
   Restart Rekindle. `/api/demo/status` should now report `n8n.live = true` and `/insights` shows **n8n · Live**.

## Contract

Rekindle → n8n (launch), header `x-rekindle-secret`:

```json
{
  "campaignId": "cmu…",
  "name": "Live in 14 days",
  "assets": [
    { "platform": "linkedin", "body": "Security tools rarely stall on price…" },
    { "platform": "x", "body": "First post…", "thread": ["Second post…", "Third post…"] }
  ],
  "targetAccounts": [{ "id": "account-tripnest", "name": "Tripnest" }],
  "callbackUrl": "https://your-rekindle.example.com/api/webhooks/n8n"
}
```

n8n responds `{ "postUrls": { "linkedin": "https://www.linkedin.com/feed/update/urn:li:share:…", "x": "https://x.com/i/web/status/…" } }`. Rekindle waits 15 s; if the call fails it launches as simulated and shows a warning. Late URLs still arrive through the `post.published` callback.

Target accounts are sent for the relay's matching only; public copy never names them.

## Test with curl

```bash
# 1. Trigger the publish workflow directly (posts for real once credentials are set!)
curl -X POST "$N8N_CAMPAIGN_WEBHOOK_URL" \
  -H 'content-type: application/json' -H "x-rekindle-secret: $N8N_SHARED_SECRET" \
  -d '{"campaignId":"test","name":"Test","assets":[{"platform":"x","body":"Hello from Rekindle","thread":["Second post"]}],"targetAccounts":[],"callbackUrl":"http://localhost:3000/api/webhooks/n8n"}'

# 2. Callback: a post went live (marks the campaign "Launched via n8n" and stores the URL)
curl -X POST http://localhost:3000/api/webhooks/n8n \
  -H 'content-type: application/json' -H "x-rekindle-secret: $N8N_SHARED_SECRET" \
  -d '{"event":"post.published","campaignId":"<campaign id>","platform":"linkedin","postUrl":"https://www.linkedin.com/feed/update/urn:li:share:7000000000000000000"}'

# 3. Callback: someone at a target account engaged (by accountId, accountDomain or companyName)
curl -X POST http://localhost:3000/api/webhooks/n8n \
  -H 'content-type: application/json' -H "x-rekindle-secret: $N8N_SHARED_SECRET" \
  -d '{"event":"engagement","campaignId":"<campaign id>","companyName":"Tripnest","platform":"linkedin","type":"comment","roleTitle":"Head of Engineering"}'

# 3b. Several at once
curl -X POST http://localhost:3000/api/webhooks/n8n \
  -H 'content-type: application/json' -H "x-rekindle-secret: $N8N_SHARED_SECRET" \
  -d '{"event":"engagement.batch","campaignId":"<campaign id>","events":[{"accountId":"account-zestcart","platform":"x","type":"like","roleTitle":"CTO"},{"accountId":"account-zestcart","platform":"linkedin","type":"click"}]}'

# 4. Wrong secret → 401
curl -i -X POST http://localhost:3000/api/webhooks/n8n -H 'x-rekindle-secret: nope' -d '{}'
```

Engagement responses return `{ events, laneChanges }`. Rekindle keeps one `CAMPAIGN_ENGAGEMENT` signal per account per campaign (`dedupeKey campaign:{campaignId}:{accountId}`) carrying the cumulative event count: 1 engagement ≈ Warm, 3+ from the account whose objection the campaign answers ≈ Revive.

Valid `type` values: `view`, `click`, `like`, `comment`, `reply`. Valid `platform`: `linkedin`, `x`.

## Signal ingest body

`signal-collector` posts to `POST {APP_BASE_URL}/api/signals/ingest` with header `x-rekindle-secret`:

```json
{ "accountDomain": "finvarapay.example", "accountId": "account-finvara", "type": "FUNDING", "title": "Finvara Pay raises ₹180 Cr Series B", "sourceUrl": "https://news.google.com/…", "occurredAt": "2026-09-24T05:30:00.000Z", "dedupeKey": "news:finvarapay.example:…" }
```


## Vyapar AI (Paytm for Business)

`vyapar.json` is the single webhook (`POST /webhook/vyapar`) behind Vyapar AI. Rekindle posts `{ event, ...payload, callbackUrl }` with the `x-rekindle-secret` header:

| `event` | Sent when | Payload |
|---|---|---|
| `action.requested` | A buyer asks for a sample, a visit or confirms an order (Autopilot or approved reply) | `type` (`SAMPLE_DISPATCH` · `MEETING` · `PAYMENT_LINK` · `FOLLOW_UP`), `dealId`, `merchant { name, owner, area, phone }`, `valueInr`, `lines[]` |
| `campaign.launch` | Rahul approves a campaign on **Campaigns** | `objection`, `headline`, `assets { inapp, whatsapp, instagram }`, `audience` |

The workflow writes one ops message (Slack incoming webhook or a WhatsApp group bot at `$env.VYAPAR_OPS_WEBHOOK_URL`), responds `{ ref, status: "queued" }`, then calls back `POST /api/vyapar/webhooks/n8n` with `{ event: "action.completed", ref, status, note }`. Status `delivered` moves the deal to *Sample sent*, and `paid` moves it to *Order won*.

Set `N8N_VYAPAR_WEBHOOK_URL=https://your-n8n.example.com/webhook/vyapar` in `.env`. Without it, every action is created as **Simulated** and labelled that way in the chat.
