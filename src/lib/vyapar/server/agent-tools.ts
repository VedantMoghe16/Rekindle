import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/providers/sarvam-agent";
import { demoPhone } from "@/lib/vyapar/server/demo-phone";
import { tgSendText, demoChatId, isTelegramConfigured } from "@/lib/providers/telegram";
import { counterFor, lastBuyerTurn, lessons, offerSheet, parseObjections, parseQty, quote, topPlays } from "@/lib/vyapar/agent-brain";
import { firstName } from "@/lib/vyapar/pitch";
import { OBJECTION_LABELS, rupees, type Objection } from "@/lib/vyapar/taxonomy";
import { getSeller, liveNow, remember, viewMerchant } from "@/lib/vyapar/server/context";
import { deliverToTelegram, triggerAction } from "@/lib/vyapar/server/conversation";

/**
 * Backend for the Sarvam "Vyapar SDR" agent: an on_start context hook and mid-call tools.
 * Reads/writes Prisma only (no LLM, no network on the hot path) so each answer is fast; writes appear in the app
 * immediately. Every response carries a short `say` line the agent can speak.
 */

export type ToolInput = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** Finds the deal for this call: explicit deal_id → caller's phone → the AI call in progress (calls run one at a time). */
export async function resolveDeal(input: ToolInput) {
  const dealId = str(input.deal_id ?? input.dealId);
  if (dealId) {
    const d = await db.vyaparDeal.findUnique({ where: { id: dealId } });
    if (d) return d;
  }
  const rawPhone = str(input.phone ?? input.user_identifier ?? input.caller ?? input.from);
  const phone = rawPhone ? normalizePhone(rawPhone) : "";
  const dialing = await db.vyaparAction.findFirst({ where: { type: "AI_CALL", status: "dialing" }, orderBy: { createdAt: "desc" } });
  if (phone) {
    const routed = await db.vyaparDeal.findFirst({ where: { demoPhone: { in: [phone, phone.replace(/^\+91/, "")] } }, orderBy: { lastTouchAt: "desc" } });
    if (dialing && (!routed || routed.id === dialing.dealId || !routed.demoPhone)) return db.vyaparDeal.findUnique({ where: { id: dialing.dealId } });
    if (routed) return routed;
    const demo = (await demoPhone()) ?? "";
    if (demo && phone === demo) {
      const lastCall = await db.vyaparAction.findFirst({ where: { type: "AI_CALL" }, orderBy: { createdAt: "desc" } });
      if (lastCall) return db.vyaparDeal.findUnique({ where: { id: lastCall.dealId } });
    }
  }
  if (dialing) return db.vyaparDeal.findUnique({ where: { id: dialing.dealId } });
  return null;
}

async function load(input: ToolInput) {
  const deal = await resolveDeal(input);
  const seller = await getSeller();
  if (!deal) return { deal: null, seller, merchant: null, memories: [] as Awaited<ReturnType<typeof db.vyaparMemory.findMany>> };
  const [m, memories] = await Promise.all([db.merchant.findUniqueOrThrow({ where: { id: deal.merchantId } }), db.vyaparMemory.findMany({ where: { dealId: deal.id }, orderBy: { createdAt: "desc" } })]);
  return { deal, seller, merchant: viewMerchant(m), memories };
}

const BAND_VOLUME: Record<string, string> = { High: "about 1,500 bags a month", Medium: "about 1,000 bags a month", Low: "about 500 bags a month" };

/** on_start hook: who this is, what we know, what they objected to, the best plays and the exact offer sheet. */
export async function callContext(input: ToolInput) {
  const { deal, seller, merchant, memories } = await load(input);
  const sheet = offerSheet(seller.offers);
  if (!deal || !merchant) {
    return { buyer_known: "no", owner_name: "", merchant_name: "", known_facts: "", filled_slots: "", past_objections: "", lessons: lessons().join(" | "), top_plays: topPlays([]).join(" | "), offer_sheet: sheet, deal_id: "", seller_name: seller.ownerFirstName, seller_business: seller.merchant.name };
  }
  const objections = memories.filter((x) => x.kind === "OBJECTION");
  const timing = memories.find((x) => x.kind === "TIMING");
  const supplierQuote = objections.find((o) => o.category === "HAS_SUPPLIER")?.quote ?? objections.map((o) => o.quote ?? "").find((q) => /supplier|wale se|₹\s*\d/.test(q));
  const facts: [string, string | null][] = [
    ["volume", merchant.source === "osm" ? null : BAND_VOLUME[merchant.qrVolumeBand] ?? null],
    ["restock_day", timing?.summary ?? null],
    ["current_supplier", supplierQuote ? `They said: "${supplierQuote}"` : null],
    ["category", `${merchant.category} in ${merchant.area}`],
  ];
  const known = facts.filter(([, v]) => v);
  return {
    buyer_known: "yes", deal_id: deal.id, stage: deal.stage,
    owner_name: firstName(merchant.ownerName), merchant_name: merchant.name,
    known_facts: known.map(([k, v]) => `${k.replace("_", " ")}: ${v}`).join("; "),
    known_volume: facts[0][1] ?? "", restock_day: timing?.summary ?? "", current_supplier: supplierQuote ?? "",
    filled_slots: known.map(([k]) => k).join(", "),
    past_objections: objections.slice(0, 3).map((o) => `${OBJECTION_LABELS[(o.category ?? "OTHER") as Objection] ?? o.category}${o.quote ? ` ("${o.quote}")` : ""}`).join("; "),
    lessons: lessons().slice(0, 3).join(" | "),
    top_plays: topPlays(objections.map((o) => (o.category ?? "OTHER") as Objection)).join(" | "),
    offer_sheet: sheet,
    seller_name: seller.ownerFirstName, seller_business: seller.merchant.name,
  };
}

export async function getCounter(input: ToolInput) {
  const { deal, seller, merchant, memories } = await load(input);
  const buyerText = str(input.buyer_said) || lastBuyerTurn(input.transcript);
  const objections = parseObjections(str(input.objections ?? input.objection));
  const known = memories.find((m) => m.kind === "OBJECTION" && m.quote && /₹\s*\d/.test(m.quote))?.quote;
  const competitor = known ? Number(known.match(/₹\s*(\d+(?:\.\d+)?)/g)?.at(-1)?.replace(/[^\d.]/g, "")) || null : null;
  const c = counterFor({ objections, buyerText, buyerFirstName: merchant ? firstName(merchant.ownerName) : "", sellerFirstName: seller.ownerFirstName, offers: seller.offers, competitorPriceInr: competitor });
  if (deal) await db.vyaparDeal.update({ where: { id: deal.id }, data: { nextStep: `On call: answered ${OBJECTION_LABELS[c.objection].toLowerCase()} with ${c.label.toLowerCase()}`, lastTouchAt: liveNow() } });
  return { say: c.say, play: c.label, win_rate: `${c.winRate}%`, objection: OBJECTION_LABELS[c.objection], follow_up_for: c.followUpFor ? OBJECTION_LABELS[c.followUpFor] : "" };
}

export async function quotePrice(input: ToolInput) {
  const { seller } = await load(input);
  const qty = parseQty(input.qty ?? input.quantity) ?? parseQty(lastBuyerTurn(input.transcript)) ?? 1000;
  const q = quote(seller.offers, qty, str(input.sku) || null);
  return { say: q.say, quantity: String(q.qty), unit_price: rupees(q.unitPriceInr), total: rupees(q.totalInr), product: q.product };
}

export async function logObjection(input: ToolInput) {
  const { deal } = await load(input);
  if (!deal) return { ok: false, say: "Theek hai ji, noted." };
  const type = parseObjections(str(input.type ?? input.objection_type ?? input.objection))[0] ?? "OTHER";
  const quoteText = str(input.quote ?? input.objection_quote) || lastBuyerTurn(input.transcript) || null;
  await db.vyaparMemory.create({ data: { dealId: deal.id, merchantId: deal.merchantId, kind: "OBJECTION", category: type, summary: `Said on the call: ${OBJECTION_LABELS[type].toLowerCase()}`, quote: quoteText, verified: false, createdAt: liveNow() } });
  await db.vyaparDeal.update({ where: { id: deal.id }, data: { stage: ["SAMPLE_REQUESTED", "SAMPLE_SENT", "ORDER_WON"].includes(deal.stage) ? deal.stage : "OBJECTION", objection: type, lastTouchAt: liveNow() } });
  remember([{ id: `call-objection-${deal.id}-${Date.now()}`, dealId: deal.id, title: "Objection heard on a call", text: `On a live AI call, the buyer raised: ${OBJECTION_LABELS[type]}${quoteText ? ` ("${quoteText}")` : ""}.` }]);
  return { ok: true, say: "Samajh gayi ji.", objection: OBJECTION_LABELS[type] };
}

export async function scheduleFollowup(input: ToolInput) {
  const { deal, merchant } = await load(input);
  if (!deal) return { ok: false, say: "Ji, main yaad rakhungi." };
  const when = str(input.time ?? input.when ?? input.callback_time) || "tomorrow";
  const reason = str(input.reason);
  await triggerAction(deal.id, "FOLLOW_UP", when);
  await db.vyaparMemory.create({ data: { dealId: deal.id, merchantId: deal.merchantId, kind: "TIMING", summary: `Call back: ${when}${reason ? ` (${reason})` : ""}`, createdAt: liveNow() } });
  await alertSeller(`⏰ Follow-up booked by the AI call: ${merchant?.name ?? "buyer"}, ${when}${reason ? ` (${reason})` : ""}.`);
  return { ok: true, say: `Ji bilkul, ${when} ko phir baat karte hain.` };
}

export async function bookSample(input: ToolInput) {
  const { deal, merchant } = await load(input);
  if (!deal || !merchant) return { ok: false, say: `Ji, sample ke liye ${(await getSeller()).ownerFirstName} ji aapko Telegram pe confirm karenge.` };
  const when = str(input.time ?? input.when) || "tomorrow 11 am";
  const place = str(input.place ?? input.address) || merchant.name;
  await triggerAction(deal.id, "SAMPLE_DISPATCH", `${when} · ${place}`);
  await db.vyaparDeal.update({ where: { id: deal.id }, data: { stage: "SAMPLE_REQUESTED", lastTouchAt: liveNow(), nextStep: `Sample ${when} at ${place}` } });
  await db.vyaparMemory.updateMany({ where: { dealId: deal.id, kind: "OBJECTION", resolved: false }, data: { resolved: true } });
  await alertSeller(`📦 Sample booked on a live AI call!\n${merchant.name} (${merchant.ownerName})\nWhen: ${when}\nWhere: ${place}`);
  remember([{ id: `call-sample-${deal.id}-${Date.now()}`, dealId: deal.id, title: "Sample booked on a call", text: `${merchant.name} agreed to a free sample on a live AI call: ${when} at ${place}.` }]);
  return { ok: true, say: `Done ji! Sample ${when} ko ${place} pe pahunch jaayega.` };
}

export async function sendOnTelegram(input: ToolInput) {
  const { deal, seller, merchant } = await load(input);
  if (!deal) return { ok: false, say: "Ji, main bhej deti hoon." };
  const what = (str(input.what) || "price_list").toLowerCase();
  const o = seller.offers;
  const body = /sample/.test(what) ? `Free sample: ${o.freeSample.contents}. Bas reply karein "SAMPLE" aur time batayein.`
    : /offer|bulk|discount/.test(what) ? `Bulk offer: ${o.tiers.map((t) => `${t.minQty.toLocaleString("en-IN")}+ pcs @ ₹${t.unitPriceInr.toFixed(2)}`).join(", ")}. Free sample pehle. ${o.credit.days}-day credit via Paytm Postpaid.`
    : `Price list (${seller.merchant.name}):\n${o.catalog.map((c) => `• ${c.name}: ₹${c.unitPriceInr}`).join("\n")}\n${o.tiers.map((t) => `• ${t.label}: ₹${t.unitPriceInr.toFixed(2)} for ${t.minQty.toLocaleString("en-IN")}+`).join("\n")}\nMOQ ${o.moq} · same-day delivery within ${o.deliveryRadiusKm} km`;
  const chat = await deliverToTelegram(deal.id, `${body}\n\n(Sent during your call with ${seller.persona.agentName})`);
  await db.vyaparMessage.create({ data: { dealId: deal.id, direction: "out", text: body, author: `${seller.persona.agentName} · sent during call`, provider: "sarvam-agent", metaJson: JSON.stringify(chat ? { telegram: true, telegramChat: chat } : {}), createdAt: liveNow() } });
  return { ok: Boolean(chat), say: `${merchant ? firstName(merchant.ownerName) : ""} ji, maine Telegram pe bhej diya hai.`.trim() };
}

async function alertSeller(text: string) {
  if (!isTelegramConfigured()) return;
  const chat = process.env.VYAPAR_SELLER_CHAT_ID?.trim() || demoChatId();
  await tgSendText(`🔔 Seller alert (Vyapar AI)\n${text}`, chat).catch((e) => console.warn(`[vyapar] seller alert failed: ${e instanceof Error ? e.message : e}`));
}

export const TOOLS = { context: callContext, get_counter: getCounter, quote_price: quotePrice, log_objection: logObjection, schedule_followup: scheduleFollowup, book_sample: bookSample, send_on_telegram: sendOnTelegram } as const;
export type ToolName = keyof typeof TOOLS;
