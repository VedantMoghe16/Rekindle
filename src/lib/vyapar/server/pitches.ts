import { db } from "@/lib/db";
import { callStructured, defaultProvider, isProviderConfigured, LlmOfflineMiss } from "@/lib/providers/llm";
import { PitchDraft, firstName, validatePitch, WHATSAPP_WORD_LIMIT } from "@/lib/vyapar/pitch";
import { groundedPitch } from "@/lib/vyapar/grounded";
import { unsupportedClaims, type Opportunity } from "@/lib/vyapar/opportunity";
import { evaluateMerchants, logEvent } from "@/lib/vyapar/server/opportunities";
import { deliverToTelegram } from "@/lib/vyapar/server/conversation";
import { isSarvamTtsConfigured, sarvamTts } from "@/lib/providers/sarvam";
import { HuntPlan } from "@/lib/vyapar/planner";
import { estimateValue, getSeller, liveNow, remember, viewMerchant } from "@/lib/vyapar/server/context";

export type StoredPitch = PitchDraft & {
  provider: "sarvam" | "claude" | "gemini" | "cached" | "template";
  angle?: Opportunity["angle"];
  problems?: string[];
  contact?: Opportunity["contact"];
  hypothesis?: string;
};

const PITCH_SYSTEM = `You write a first Telegram message from one small Indian merchant to another nearby merchant.
Write in natural Hinglish (Roman script), warm and respectful ("ji"), like a local business owner, not a marketer.
Max ${WHATSAPP_WORD_LIMIT} words. Exactly one claim about the buyer, one offer and one question. Use ONLY the evidence lines given;
never mention the buyer's payments, sales, QR receipts or anything marked private. Do not invent urgency.
Follow the ANGLE: STRONG_NEED answers what they asked; EXPANSION acknowledges the public event; CATEGORY_FIT introduces a nearby supplier with a low-commitment sample.
highlights: 3-5 short exact substrings of your text that are personalised. why: copy the provided evidence lines.`;

async function context(leadId: string) {
  const lead = await db.vyaparLead.findUnique({ where: { id: leadId }, include: { merchant: true, hunt: true } });
  if (!lead) return null;
  const seller = await getSeller();
  const plan = HuntPlan.parse(JSON.parse(lead.hunt.planJson));
  const merchant = viewMerchant(lead.merchant);
  const { opps } = await evaluateMerchants(seller, plan, [merchant]);
  return { lead, seller, plan, merchant, opp: opps[0] };
}

/** Draft for a lead, chosen by conversation purpose from verified opportunity facts. */
export async function getPitch(leadId: string, fresh = false) {
  const c = await context(leadId);
  if (!c) return null;
  if (c.lead.pitchJson && !fresh) {
    const stored = JSON.parse(c.lead.pitchJson) as StoredPitch;
    if (stored.angle) return { lead: c.lead, merchant: c.merchant, opp: c.opp, pitch: stored };
  }
  const sellerCtx = { name: c.seller.merchant.name, firstName: c.seller.ownerFirstName, area: c.seller.merchant.area, offers: c.seller.offers };
  const grounded = groundedPitch({ seller: sellerCtx, merchant: c.merchant, opp: c.opp, language: c.plan.language });
  let pitch: StoredPitch = { text: grounded.text, highlights: grounded.highlights, why: grounded.why, provider: "template", angle: grounded.angle, problems: grounded.problems, contact: c.opp.contact, hypothesis: c.opp.hypothesis };
  if (c.opp.angle !== "INTRO") {
    const provider = process.env.SARVAM_DRAFTS === "true" && isProviderConfigured("sarvam") ? "sarvam" : defaultProvider();
    try {
      const evidence = [...c.opp.whyMerchant.map((e) => `${e.claim} (${e.source})`), ...(c.opp.timing.evidence && !c.opp.timing.evidence.private ? [`${c.opp.timing.evidence.claim} (${c.opp.timing.evidence.source}, ${c.opp.timing.evidence.observedAt})`] : [])];
      const result = await callStructured({
        tier: "fast", provider, schema: PitchDraft, schemaName: "VyaparPitchV2", system: PITCH_SYSTEM,
        user: `SELLER: ${sellerCtx.firstName} from ${sellerCtx.name}, ${sellerCtx.area}. Offer: ${c.opp.sku ? `${c.opp.sku.name} at ₹${c.opp.sku.unitPriceInr}` : "packaging"}; free sample: ${c.seller.offers.freeSample.enabled ? "yes" : "no"}; same-day delivery.
BUYER: ${c.merchant.ownerName}, ${c.merchant.name} (${c.merchant.category}), ${c.opp.distanceKm} km away.
ANGLE: ${c.opp.angle}. HYPOTHESIS: ${c.opp.hypothesis}.
EVIDENCE YOU MAY USE: ${JSON.stringify(evidence)}
LANGUAGE: ${c.plan.language}${fresh ? `\nVARIANT: ${Date.now() % 997}` : ""}
WHY LINES (copy into why): ${JSON.stringify(grounded.why)}`,
      });
      const problems = [...validatePitch(result.data.text), ...unsupportedClaims(result.data.text, c.opp)];
      if (problems.length === 0) pitch = { ...result.data, why: grounded.why, provider: result.provenance === "cached" ? "cached" : provider === "sarvam" ? "sarvam" : provider === "gemini" ? "gemini" : "claude", angle: c.opp.angle, problems: [], contact: c.opp.contact, hypothesis: c.opp.hypothesis };
      else console.warn(`[vyapar] LLM pitch rejected (${problems.join("; ")}), using grounded template`);
    } catch (error) {
      if (!(error instanceof LlmOfflineMiss)) console.warn(`[vyapar] pitch via LLM failed, using template: ${error instanceof Error ? error.message : error}`);
    }
  }
  await db.vyaparLead.update({ where: { id: leadId }, data: { pitchJson: JSON.stringify(pitch) } });
  return { lead: c.lead, merchant: c.merchant, opp: c.opp, pitch };
}

/** Sends the approved pitch: opens a deal and a Telegram thread with the merchant. */
export async function sendPitch(leadId: string, text: string, withVoice: boolean, route?: { chatId: string | null; phone: string | null }) {
  const c = await context(leadId);
  if (!c) throw new Error("Lead not found");
  if (c.lead.dealId) return c.lead.dealId;
  if (c.opp.contact.status !== "verified") throw new Error("No verified business contact for this merchant. Plan a visit instead.");
  const existing = await db.vyaparDeal.findFirst({ where: { merchantId: c.lead.merchantId, stage: { notIn: ["LOST", "ORDER_WON"] } } });
  if (existing) {
    await db.vyaparLead.update({ where: { id: leadId }, data: { status: "PITCHED", dealId: existing.id } });
    if (route) await db.vyaparDeal.update({ where: { id: existing.id }, data: { demoChatId: route.chatId, demoPhone: route.phone } });
    return existing.id;
  }
  const at = liveNow();
  const stored = c.lead.pitchJson ? (JSON.parse(c.lead.pitchJson) as StoredPitch) : null;
  const provider = stored?.provider ?? "template";
  const deal = await db.vyaparDeal.create({
    data: {
      merchantId: c.lead.merchantId, stage: "PITCHED", demoChatId: route?.chatId ?? null, demoPhone: route?.phone ?? null, valueInr: estimateValue(c.lead.merchant.qrVolumeBand, c.opp.sku?.unitPriceInr ?? c.seller.unitPriceInr), autopilot: c.seller.autopilot, lastTouchAt: at, nextStep: "Waiting for reply",
      messages: {
        create: [
          { direction: "out", kind: "text", text, author: "Vyapar AI", provider, createdAt: at, metaJson: JSON.stringify({ leadId }) },
          ...(withVoice ? [{ direction: "out", kind: "voice", text, author: "Vyapar AI", provider: "sarvam-tts", createdAt: new Date(at.getTime() + 150) }] : []),
        ],
      },
    },
  });
  await db.vyaparLead.update({ where: { id: leadId }, data: { status: "PITCHED", dealId: deal.id } });
  // "Send on Telegram" → routed demo chat (text + Sarvam voice note when available).
  let voice: Buffer | null = null;
  if (withVoice && isSarvamTtsConfigured()) voice = await sarvamTts(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")).catch(() => null);
  const chat = await deliverToTelegram(deal.id, text, voice);
  if (chat) await db.vyaparMessage.updateMany({ where: { dealId: deal.id, direction: "out" }, data: { metaJson: JSON.stringify({ leadId, telegram: true, telegramChat: chat }) } });
  // Delivery is simulated in the prototype: never logged as a delivered message.
  if (stored && stored.text.trim() !== text.trim()) await logEvent({ sellerId: c.seller.id, type: "DRAFT_EDITED", huntId: c.lead.huntId, leadId, merchantId: c.lead.merchantId, dealId: deal.id, meta: { angle: stored.angle } });
  await logEvent({ sellerId: c.seller.id, type: "APPROVED_SENT", huntId: c.lead.huntId, leadId, merchantId: c.lead.merchantId, dealId: deal.id, position: c.lead.position, provenance: "simulated", meta: { angle: stored?.angle, withVoice } });
  remember([{ id: `pitch-${deal.id}`, text: `${c.seller.merchant.name} pitched ${c.lead.merchant.name} (${c.lead.merchant.category}, owner ${firstName(c.lead.merchant.ownerName)}) on Telegram: ${text}` }]);
  return deal.id;
}
