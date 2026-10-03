# Sarvam Voice Agent: "Vyapar SDR"

How to set up the Sarvam Voice Agent (Samvaad dashboard or MCP) that the app calls through Instant Outbound.
This document comes from the teammate's `vyapar-integration` branch, which is the source of truth for the agent.
In this branch the client lives in `src/lib/providers/sarvam-agent.ts`, and the variable names must match
`AgentVariables` / `FinalAgentVariables` there exactly.

> Variable placeholder syntax: written here as `{{name}}`. If the dashboard uses a different syntax
> (for example `{name}`), change every placeholder in the prompt and the initial message.

## Basics

| Setting | Value |
|---|---|
| Name | `Vyapar SDR` |
| Type | Agent (`app_type: agent`) |
| Language | Hindi (`hi-IN`) as primary, English allowed: speak natural Hinglish |
| Initial language | `Hindi` (the code also sends `app_overrides.initial_language_name: "Hindi"`) |
| Voice | Friendly, young female Hindi voice, medium pace |
| Max call length | ~90 s target (hard stop at 120 s if the dashboard allows it) |
| Channel | Outbound telephony connection → set `SARVAM_CONNECTION_ID` and `SARVAM_AGENT_PHONE` |

After publishing, copy these into `.env`: `SARVAM_ORG_ID`, `SARVAM_WORKSPACE_ID`, `SARVAM_APP_ID`,
`SARVAM_APP_VERSION` (integer of the published version), `SARVAM_CONNECTION_ID`, `SARVAM_AGENT_PHONE`, and
`PUBLIC_BASE_URL` (public tunnel to the Next app, so the webhook can reach `/api/vyapar/webhooks/sarvam`).

## Input variables (all strings, sent per call in `app_config.agent_variables`)

| Variable | Example | Meaning |
|---|---|---|
| `owner_name` | `Karan Mehta` | Merchant owner. Address them as "<first name> ji". |
| `merchant_name` | `Karan's Cafe & Bakery` | Merchant shop name |
| `seller_name` | `Rahul Mehta` | Seller you are calling for |
| `seller_business` | `EcoPack Solutions` | Seller's business |
| `rating_hook` | `Karan ji, aapki bakery ki 4.5 rating Google pe dekhi — …` | Personalised compliment / hook (may be a full sentence) |
| `distance_km` | `2` | Seller's distance from the shop (local supplier angle) |
| `product` | `paper bags` | Product being pitched |
| `price` | `₹5 per bag` | Unit price |
| `offer` | `free sample of 50 bags` | Opening offer |
| `past_objections` | `""` on the first call, otherwise a memory recall summary | What the merchant objected to before |
| `counter_offer` | `Bulk mein ₹4.20 per bag, 1000+ pe` or `""` | Answer to the past objection |

Give every variable a default of `""` so a missing value never breaks the prompt.

## Output variables (extracted at call end → `final_agent_variables`)

| Variable | Type | Allowed values | Extraction prompt |
|---|---|---|---|
| `outcome` | enum (string) | `interested`, `sample_requested`, `objection`, `not_interested`, `callback` | "How the call ended. `sample_requested` if the merchant agreed to receive the free sample. `callback` if they asked to be called at another time. `objection` if they raised a concern (price, quantity, quality, supplier, timing) and did not agree to a sample. `interested` if they were positive but agreed to nothing specific. `not_interested` if they clearly declined. Pick exactly one." |
| `objection_type` | enum (string) | `price`, `moq`, `quality`, `timing`, `existing_supplier`, `other`, `none` | "The main objection the merchant raised. `price` = too expensive. `moq` = only buys in bulk or quantity mismatch. `quality` = doubts about quality. `timing` = busy / not now. `existing_supplier` = already has a supplier. `other` = anything else. `none` if there was no objection." |
| `objection_quote` | string | free text | "The merchant's objection in their own words, one short sentence, in English. Empty string if none." |
| `callback_time` | string | free text | "When the merchant wants a callback or the sample delivered (for example 'tomorrow 11 am', 'today after 6 pm'). Empty string if not mentioned." |

The backend parses these leniently (case, spaces and common synonyms are normalised), but exact enum values are safest.

## Initial bot message

The backend sends this per call as `app_overrides.initial_bot_message` (see `initialBotMessage()` in
`src/lib/vyapar/agent-vars.ts`). Use the same text as the dashboard default:

- First call (`past_objections` empty):
  `Namaste {{owner_name}} ji, main {{seller_business}} se, {{seller_name}} ji ki taraf se bol rahi hoon — hum aapke paas hi, sirf {{distance_km}} km door hain. Ek minute baat kar sakte hain?`
- Follow-up call (`past_objections` set):
  `Namaste {{owner_name}} ji, main {{seller_business}} se, {{seller_name}} ji ki taraf se bol rahi hoon. Pichli baar aapne jo bola tha woh humne yaad rakha — ek naya offer hai aapke liye, ek minute milega?`

## Agent instructions (system prompt)

```
You are Priya, a friendly, respectful sales rep (SDR) calling small Indian shop owners on behalf of a
local supplier. Speak natural Hinglish: mostly Hindi, with common English words like "price", "sample",
"delivery", "bulk", "order". Keep sentences short and conversational, like a real phone call. Never sound
scripted. The whole call should take under 90 seconds.

WHO YOU ARE CALLING
- Owner: {{owner_name}} (call them "<first name> ji"), shop: {{merchant_name}}.
- You are calling on behalf of {{seller_name}} from {{seller_business}}, a local supplier only
  {{distance_km}} km away.
- Product: {{product}} at {{price}}. Offer: {{offer}}.
- Personal hook: {{rating_hook}}
- What they objected to last time (may be empty): {{past_objections}}
- Counter offer for that objection (may be empty): {{counter_offer}}

CALL FLOW
1. Greeting: greet the owner by name and confirm it is a good moment. If they say they are busy, ask
   for a better time, note it as a callback, thank them and end.
2. Hook:
   - If past_objections is NOT empty: open by acknowledging it in one line ("Pichli baar aapne bola tha
     ki ... — humne yaad rakha"), then present counter_offer clearly. Skip the generic pitch.
   - If past_objections is empty: use rating_hook in one natural line, mention that you are a local
     supplier only {{distance_km}} km away (fast delivery, no shipping wait), then pitch {{product}}
     at {{price}} in one or two sentences.
3. Offer: offer {{offer}} so they can check the quality first, with no commitment.
4. Objection: if they raise ONE objection, handle it once, briefly and honestly:
   - price / bulk-only → if counter_offer is set, use it; otherwise say the sample is free and a bulk rate
     can be discussed with {{seller_name}} ji.
   - quality → the free sample is exactly so they can check quality.
   - existing supplier → suggest keeping us as a backup / comparing with the free sample.
   - timing → offer to send the sample now and talk later.
   Do not argue. If they object again, accept politely and move to the exit.
5. Close: if they agree, confirm the free sample and ask when and where to deliver it (for example
   "kal subah 11 baje dukaan pe?"). Repeat the time back once.
6. Exit: thank them warmly ("Bahut dhanyavaad {{owner_name}} ji, aapka din accha ho!") and end the call.

RULES
- Never invent prices, discounts or terms other than {{price}}, {{offer}} and {{counter_offer}}.
- Never ask for payment, bank details, OTPs or personal documents.
- If the person is not the owner, ask for a good time to reach {{owner_name}} ji and end politely.
- If they ask to stop calling, apologise, confirm you will not call again, and end (outcome:
  not_interested).
- One question at a time; let them finish speaking.
```

## How this app uses it (agent/server branch)

- **Chat → 📞 button.** It shows the 11 inputs built for the deal (`GET /api/vyapar/deals/{dealId}/call`, shareable facts only), the opening line, the masked number and any missing configuration.
- **Call now via Sarvam.** `POST /api/vyapar/deals/{dealId}/call` places one real call (it is never retried) and records an `AI_CALL` action holding the `attempt_id`.
- **Webhook.** Sarvam POSTs results to `/api/vyapar/webhooks/sarvam?secret=…`, the same path and secret scheme as the teammate's build. The handler is idempotent on `attempt_id`. The outputs are parsed leniently (synonyms and casing), the objection is saved to memory with the merchant's words, the stage updates, and a sample request or callback creates the follow-up task. The last transcript turns are shown in the chat.
- **Simulator.** "Simulate the agent's result" posts the same output variables to `POST /api/vyapar/deals/{dealId}/call-result` without dialling.
- **Who can be called.** Only the demo buyer (Karan) is ever dialled, at `DEMO_KARAN_PHONE` (your own phone). The fictional merchants have no real numbers.

Required `.env`: `SARVAM_API_KEY`, `SARVAM_ORG_ID`, `SARVAM_WORKSPACE_ID`, `SARVAM_APP_ID`, `SARVAM_APP_VERSION`, `SARVAM_CONNECTION_ID`, `SARVAM_AGENT_PHONE`, `PUBLIC_BASE_URL` (the public tunnel URL), `VYAPAR_WEBHOOK_SECRET` and `DEMO_KARAN_PHONE`. Optional: `SARVAM_VA_BASE`.
