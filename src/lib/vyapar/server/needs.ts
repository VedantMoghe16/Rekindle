import { db } from "@/lib/db";
import { callStructured, LlmOfflineMiss } from "@/lib/providers/llm";
import { haversineKm } from "@/lib/vyapar/geo";
import { compareMatches, evaluateNeedMatch, MAX_OFFERS, missingFields, NeedDraft, parseNeed, PRODUCTS, rupeesFromPaise, type Need, type NeedMatch, type Offer, type ProductKey } from "@/lib/vyapar/needs";
import { firstName } from "@/lib/vyapar/pitch";
import { getSeller, liveNow, remember, viewMerchant } from "@/lib/vyapar/server/context";
import { sendMessage, triggerAction } from "@/lib/vyapar/server/conversation";
import { logEvent } from "@/lib/vyapar/server/opportunities";

/**
 * DECISION: Release A uses one fixed demo buyer (Karan's Cafe), resolved on the server and labelled
 * "Viewing as buyer (demo)". This is not authentication; a real deployment uses Paytm's merchant session.
 */
export const DEMO_BUYER_ID = "m-karan-s-cafe-and-bakery";

export async function getDemoBuyer() {
  const m = await db.merchant.findUnique({ where: { id: DEMO_BUYER_ID } });
  if (!m) throw new Error("Demo buyer missing. Reset the demo.");
  return viewMerchant(m);
}

const NEED_SYSTEM = `You read a short purchase request from an Indian shop owner (English, Hindi or Hinglish) and extract it.
productKey: pastry_box, paper_bag or food_container (null if it is none of these or unclear).
quantity: the number of units they need, else null. maxUnitPriceInr: the most they will pay per unit, else null.
neededBy: the date they need it by as YYYY-MM-DD, using TODAY to resolve words like "Friday" or "kal"; null if not stated.
sampleFirst: true if they want a sample or trial first. backupSupplier: true if they already have a supplier and want a backup.
Never guess a value that is not in the text.`;

/** Extracts a draft; never publishes. Missing fields are returned so the buyer confirms them. */
export async function previewNeed(raw: string) {
  const now = liveNow();
  let draft = parseNeed(raw, now);
  let provider = "rules";
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
    const weekday = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long" });
    const result = await callStructured({ tier: "fast", schema: NeedDraft, schemaName: "VyaparNeedDraft", system: NEED_SYSTEM, user: `TODAY: ${today} (${weekday})\nREQUEST: ${raw}` });
    draft = result.data;
    provider = result.provenance === "live" ? (result.provider === "anthropic" ? "claude" : result.provider) : "cached";
  } catch (error) {
    if (!(error instanceof LlmOfflineMiss)) console.warn(`[vyapar] need extraction via LLM failed, using rules: ${error instanceof Error ? error.message : error}`);
  }
  return { draft, missing: missingFields(draft), provider };
}

export type PublishInput = { rawInput: string; productKey: ProductKey; quantity: number; maxUnitPriceInr: number | null; neededBy: string; sampleFirst: boolean; backupSupplier: boolean };

export async function publishNeed(input: PublishInput) {
  const buyer = await getDemoBuyer();
  const need = await db.vyaparNeed.create({
    data: { buyerMerchantId: buyer.id, rawInput: input.rawInput, productKey: input.productKey, quantity: input.quantity, maxUnitPricePaise: input.maxUnitPriceInr != null ? Math.round(input.maxUnitPriceInr * 100) : null, neededBy: input.neededBy, sampleFirst: input.sampleFirst, backupSupplier: input.backupSupplier, createdAt: liveNow() },
  });
  const seller = await getSeller();
  await logEvent({ sellerId: seller.id, type: "NEED_PUBLISHED", merchantId: buyer.id, provenance: "demo", meta: { needId: need.id, productKey: need.productKey, quantity: need.quantity } });
  remember([{ id: `need-${need.id}`, text: `${buyer.name} (${buyer.category}, ${buyer.area}) needs ${need.quantity} ${PRODUCTS[input.productKey].label.toLowerCase()}es by ${need.neededBy}${need.maxUnitPricePaise ? `, max ${rupeesFromPaise(need.maxUnitPricePaise)} each` : ""}${need.sampleFirst ? ", sample first" : ""}${need.backupSupplier ? ", wants a backup supplier" : ""}. They said: "${input.rawInput}"` }]);
  return need.id;
}

function toOffer(o: Awaited<ReturnType<typeof db.vyaparOffer.findMany>>[number]): Offer {
  return { ...o, stockStatus: o.stockStatus as Offer["stockStatus"], tiers: JSON.parse(o.tiersJson) };
}

export async function listNeeds() {
  const buyer = await getDemoBuyer();
  const needs = await db.vyaparNeed.findMany({ where: { buyerMerchantId: buyer.id }, orderBy: { createdAt: "desc" }, include: { introductions: true } });
  return { buyer, needs };
}

/** A need with its live comparison: up to three ready offers, the ones needing confirmation, and why others don't fit. */
export async function getNeed(id: string) {
  const need = await db.vyaparNeed.findUnique({ where: { id }, include: { introductions: true } });
  if (!need) return null;
  const buyer = await getDemoBuyer();
  const offers = (await db.vyaparOffer.findMany()).map(toOffer);
  const sellers = await db.merchant.findMany({ where: { id: { in: [...new Set(offers.map((o) => o.sellerMerchantId))] } } });
  const sellerById = new Map(sellers.map((s) => [s.id, s]));
  const n: Need = { productKey: need.productKey as ProductKey, quantity: need.quantity, maxUnitPricePaise: need.maxUnitPricePaise, neededBy: need.neededBy, sampleFirst: need.sampleFirst };
  const now = liveNow();
  const matches = offers.map((o) => evaluateNeedMatch(n, o, Math.round(haversineKm(buyer, sellerById.get(o.sellerMerchantId)!) * 10) / 10, now));
  const { top, moreReady, needsConfirmation, excluded } = compareMatches(matches);
  // One reason per seller, and only for sellers with no ready or pending offer for this need.
  const placed = new Set([...matches.filter((m) => m.eligibility !== "EXCLUDED").map((m) => m.sellerMerchantId)]);
  const sameProductFirst = [...excluded].sort((a, b) => Number(b.criteria[0].status === "PASS") - Number(a.criteria[0].status === "PASS"));
  const relevantExcluded = sameProductFirst.filter((m) => !placed.has(m.sellerMerchantId)).filter((m, i, all) => all.findIndex((x) => x.sellerMerchantId === m.sellerMerchantId) === i);
  const card = (m: NeedMatch) => {
    const offer = offers.find((o) => o.id === m.offerId)!;
    const s = sellerById.get(m.sellerMerchantId)!;
    const intro = need.introductions.find((i) => i.sellerMerchantId === m.sellerMerchantId) ?? null;
    return { ...m, earliestDelivery: m.earliestDelivery.toISOString(), offer: { ...offer, confirmedAt: offer.confirmedAt?.toISOString() ?? null }, seller: { id: s.id, name: s.name, ownerName: s.ownerName, area: s.area }, intro: intro ? { id: intro.id, status: intro.status } : null };
  };
  return {
    need, buyer: { id: buyer.id, name: buyer.name, ownerName: buyer.ownerName, area: buyer.area },
    product: PRODUCTS[need.productKey as ProductKey],
    top: top.map(card), moreReady, needsConfirmation: needsConfirmation.filter((m, i, all) => all.findIndex((x) => x.sellerMerchantId === m.sellerMerchantId) === i).map(card), excluded: relevantExcluded.map(card),
    introductionsLeft: MAX_OFFERS - need.introductions.length,
  };
}

/** Buyer picks a seller. Rechecks eligibility now, caps introductions per need, and never duplicates one. */
export async function requestIntroduction(needId: string, offerId: string) {
  const view = await getNeed(needId);
  if (!view) throw new IntroError("NOT_FOUND", "Need not found.", 404);
  if (view.need.status !== "OPEN") throw new IntroError("CLOSED", "This need is closed.", 409);
  const match = view.top.find((m) => m.offerId === offerId);
  if (!match) throw new IntroError("NOT_READY", "That offer is no longer ready for this need. Refresh the comparison.", 409);
  const existing = view.need.introductions.find((i) => i.sellerMerchantId === match.sellerMerchantId);
  if (existing) return existing.id;
  if (view.introductionsLeft <= 0) throw new IntroError("CAP", `You can contact up to ${MAX_OFFERS} sellers per need.`, 409);
  const terms = { offerName: match.offer.name, unitPricePaise: match.quote!.unitPricePaise, subtotalPaise: match.quote!.subtotalPaise, quantity: view.need.quantity, unit: match.offer.unit, deliverBy: match.earliestDelivery, sampleNote: view.need.sampleFirst ? match.offer.sampleNote : null, neededBy: view.need.neededBy };
  const intro = await db.vyaparIntroduction.create({ data: { needId, offerId, sellerMerchantId: match.sellerMerchantId, termsJson: JSON.stringify(terms), createdAt: liveNow() } });
  const seller = await getSeller();
  await logEvent({ sellerId: seller.id, type: "INTRO_REQUESTED", merchantId: view.buyer.id, provenance: "demo", meta: { needId, offerId, sellerMerchantId: match.sellerMerchantId } });
  return intro.id;
}

export class IntroError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

type Terms = { offerName: string; unitPricePaise: number; subtotalPaise: number; quantity: number; unit: string; deliverBy: string; sampleNote: string | null; neededBy: string };

/** Requests addressed to the operating seller (Rahul / EcoPack). */
export async function sellerRequests() {
  const seller = await getSeller();
  const intros = await db.vyaparIntroduction.findMany({ where: { sellerMerchantId: seller.merchantId }, include: { need: true }, orderBy: { createdAt: "desc" } });
  const buyers = await db.merchant.findMany({ where: { id: { in: intros.map((i) => i.need.buyerMerchantId) } } });
  return intros.map((i) => ({ ...i, terms: JSON.parse(i.termsJson) as Terms, buyer: buyers.find((b) => b.id === i.need.buyerMerchantId)! }));
}

/** The seller's first reply, built only from the buyer's shared request and the agreed terms. */
export function introDraft(buyerOwner: string, productLabel: string, t: Terms) {
  const when = new Date(t.deliverBy).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short" });
  const sample = t.sampleNote ? ` Pehle sample chahiye toh: ${t.sampleNote.replace(/^Free sample: /, "free sample, ")}.` : "";
  return `Namaste ${firstName(buyerOwner)} ji 🙏 Aapki ${t.quantity.toLocaleString("en-IN")} ${productLabel.toLowerCase()}es ki request mili. ${t.offerName}: ${rupeesFromPaise(t.unitPricePaise)} each, total ${rupeesFromPaise(t.subtotalPaise)}. ${when} tak delivery ho jaayegi.${sample}\n\nConfirm karein?`;
}

export async function getSellerRequest(id: string) {
  const all = await sellerRequests();
  const r = all.find((x) => x.id === id);
  if (!r) return null;
  const product = PRODUCTS[r.need.productKey as ProductKey];
  return { ...r, product, draft: introDraft(r.buyer.ownerName, product.label, r.terms) };
}

/** Seller accepts: opens (or reuses) the thread with the buyer, sends the approved reply, books the sample once. */
export async function acceptIntroduction(id: string, text: string) {
  const r = await getSellerRequest(id);
  if (!r) throw new IntroError("NOT_FOUND", "Request not found.", 404);
  if (r.status === "ACCEPTED" && r.dealId) return r.dealId;
  const at = liveNow();
  const open = await db.vyaparDeal.findFirst({ where: { merchantId: r.buyer.id, stage: { notIn: ["LOST", "ORDER_WON"] } } });
  const deal = open ?? await db.vyaparDeal.create({ data: { merchantId: r.buyer.id, stage: r.need.sampleFirst ? "SAMPLE_REQUESTED" : "REPLIED", valueInr: Math.round(r.terms.subtotalPaise / 100), autopilot: true, lastTouchAt: at, nextStep: "Buyer request via Vyapar", createdAt: at } });
  await db.vyaparMessage.create({ data: { dealId: deal.id, direction: "in", text: r.need.rawInput, author: r.buyer.ownerName, provider: null, metaJson: JSON.stringify({ source: "buyer_need", needId: r.needId }), createdAt: new Date(at.getTime() - 1000) } });
  await db.vyaparMemory.create({ data: { dealId: deal.id, merchantId: r.buyer.id, kind: "PREFERENCE", summary: `Needs ${r.terms.quantity} ${r.product.label.toLowerCase()}es by ${r.need.neededBy}`, quote: r.need.rawInput, verified: true, createdAt: at } });
  if (open) await db.vyaparDeal.update({ where: { id: deal.id }, data: { stage: r.need.sampleFirst ? "SAMPLE_REQUESTED" : open.stage, valueInr: Math.max(open.valueInr, Math.round(r.terms.subtotalPaise / 100)) } });
  await sendMessage(deal.id, text, { author: "Rahul · reply to buyer request", provider: "template" });
  if (r.need.sampleFirst && r.terms.sampleNote) await triggerAction(deal.id, "SAMPLE_DISPATCH");
  await db.vyaparIntroduction.update({ where: { id }, data: { status: "ACCEPTED", dealId: deal.id, respondedAt: at } });
  const seller = await getSeller();
  await logEvent({ sellerId: seller.id, type: "INTRO_ACCEPTED", merchantId: r.buyer.id, dealId: deal.id, provenance: "simulated", meta: { needId: r.needId } });
  return deal.id;
}

export async function declineIntroduction(id: string) {
  await db.vyaparIntroduction.update({ where: { id }, data: { status: "DECLINED", respondedAt: liveNow() } });
}
