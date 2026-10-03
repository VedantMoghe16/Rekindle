# Vyapar SDR: smart call setup (context hook, mid-call tools, knowledge base, states)

This builds on `sarvam-agent.md` (same agent, same 11 input / 4 output variables). Base URL = your public app URL
(`PUBLIC_BASE_URL`, for example the trycloudflare tunnel). Secret = `VYAPAR_WEBHOOK_SECRET` from `.env`. Enter it in Sarvam
as an **api_key** or **bearer** secret, never as plain text. Each endpoint also accepts `?secret=`.

Every tool answers from our database only (no LLM), usually in tens of milliseconds, and returns a short `say` line.
Set **Max wait** to 3 s and **If it fails** to: "Ek second ji, main Rahul ji se confirm karke batati hoon."

## 1. On-start hook: load context when the call connects

**Tool:** `load_buyer_context`, lifecycle **on_start**. `POST {BASE}/api/vyapar/agent/context`

Body (type `@` to insert): `{ "phone": "@User Identifier", "deal_id": "@deal_id" }`. `deal_id` is optional; the backend falls
back to the caller's number, and then to the AI call currently in progress (calls run one at a time).

**Save reply into variables:**

| Response field | Agent variable | Meaning |
|---|---|---|
| `buyer_known` | `buyer_known` | `yes` / `no` (unknown callers get the default opening) |
| `owner_name`, `merchant_name` | same | who this is |
| `known_facts` | `known_facts` | e.g. "volume: about 1,500 bags a month; restock day: Restocks monthly on the 5th; current supplier: …" |
| `filled_slots` | `filled_slots` | facts already known; **never ask these again** |
| `past_objections` | `past_objections` | what they objected to before, with their words |
| `lessons` | `lessons` | which counter works best per objection |
| `top_plays` | `top_plays` | the 3 best plays for this buyer |
| `offer_sheet` | `offer_sheet` | every price, tier, MOQ, sample and delivery rule |
| `deal_id` | `deal_id` | pass it to every mid-call tool |

Because the lookup is by phone number, it also works for **inbound** calls: if Karan calls back +917965480507 the agent
already knows who he is and what he said last time.

## 2. Mid-call tools (lifecycle **run**)

All are `POST {BASE}/api/vyapar/agent/<name>`. In every body include
`"deal_id": "@deal_id", "phone": "@User Identifier", "transcript": "@Call Transcript"`.
Response template for all: `{{say}}`.

| Tool name | Description for the agent | Extra body fields |
|---|---|---|
| `get_counter` | Call when the buyer pushes back. Returns the best counter (≤25 words) from our win rates and what we know. Say "haan ji, ek second…" while waiting. | `"objections": "<price / moq / quality / timing / existing_supplier / credit>"` |
| `quote_price` | Call for any price question with a quantity. Never invent a number. | `"qty": "<number>"`, optional `"sku": "PB-S / PX-6 / FB-500"` |
| `log_objection` | Call as soon as the buyer states an objection. | `"type": "<objection>"`, `"quote": "<their words>"` |
| `schedule_followup` | Call when they ask to talk later. | `"time": "<when>"`, `"reason": "<why>"` |
| `book_sample` | Call when they agree to a sample. | `"time": "<when>"`, `"place": "<where>"` |
| `send_on_telegram` | Call to send the price list, bulk offer or sample details on Telegram while still talking. | `"what": "price_list / offer / sample"` |

What the app shows: objections, follow-ups and samples appear in the deal's chat **during the call**, and `book_sample` and
`schedule_followup` send Rahul a live Telegram alert. Endpoint reference: `src/app/api/vyapar/agent/[tool]/route.ts`.

## 3. Knowledge base for off-script questions

Upload `docs/vyapar/kb/ecopack-knowledge-base.md` in the agent's **Knowledge Base**. It covers catalogue, prices and tiers,
MOQ, food-grade/grease-proof, samples, delivery radius, credit and GST invoice. Regenerate it after changing offers:
`npx tsx scripts/build-agent-kb.ts`. Instruction: "For product, quality, delivery or billing questions, search the knowledge
base. If it isn't there, say Rahul ji will confirm on Telegram."

## 4. Conversation states

Create these states. Each gets only its own instructions, so the agent drifts less.

**Global rules (all states):**
- Hinglish, short turns, "ji".
- Slot filling: any fact the caller volunteers (volume, restock day, current supplier, delivery time) is filled. Never ask a slot listed in `filled_slots` or already said on this call.
- Never invent prices: use `quote_price`. Never mention their sales or payments.
- If they ask to stop calling: apologise and go to Wrap-up (outcome `not_interested`).

| State | Instructions | Moves to |
|---|---|---|
| **Opening** | Greet `{{owner_name}} ji` as `{{seller_business}}` on behalf of `{{seller_name}}` ji; ask for one minute. If `buyer_known` = yes and `past_objections` is set: "Pichli baar aapne bola tha … humne yaad rakha." If busy: `schedule_followup` and go to Wrap-up. | Discovery (or Pitch if every discovery slot is filled) |
| **Discovery** | Ask at most 2 short questions, only for unfilled slots: how many bags or boxes a month, and who supplies them now. | Pitch |
| **Pitch** | One line: local supplier, `{{distance_km}}` km away, `{{product}}` at `{{price}}`, then `{{offer}}`. Use a fact from `known_facts` if one fits. | Close, or Objection on pushback |
| **Objection** (max 2 loops) | `log_objection`, then `get_counter`, then say its `say` line. **Layered objections:** acknowledge both, ask which matters more, `get_counter` on that one, `schedule_followup` for the other. After 2 loops, stop arguing and go to Close with the sample offer. | Close |
| **Close** | Offer the free sample. On yes: ask when and where, `book_sample`, repeat the time back. Offer to `send_on_telegram` the price list. | Wrap-up |
| **Wrap-up** | Thank them by name; confirm any follow-up or sample time once; end. | end |

At call end the existing output variables (`outcome`, `objection_type`, `objection_quote`, `callback_time`) and the post-call
webhook still update the deal, memory and Cognee as before.
