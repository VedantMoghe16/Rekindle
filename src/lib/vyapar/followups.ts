import { rupees, type SellerOffers } from "@/lib/vyapar/taxonomy";

/**
 * Follow-up agent for leads that went silent (pure, no I/O, unit-tested).
 *
 *   1. Who: deals silent for 4+ days, grouped into cohorts (no reply, went quiet, stalled objection, sample check-in, lost).
 *   2. Why: every follow-up needs a reason that is NEW to the buyer (a new price tier, a festive signal, a sample
 *      still on offer...). No reason, no message: "just checking in" spam is never sent.
 *   3. What: a vetted template per cohort, objection and attempt. Gemini may personalise it, but the result must pass
 *      the same content checks as the template or the template is used.
 *   4. Guardrails: opt-out words stop all follow-ups forever; at most 3 unanswered follow-ups per deal, 4+ days apart;
 *      never while the buyer is waiting on us; lost deals only after 14 days (30 if they said not interested) and only
 *      with a new reason; only real prices from the offer sheet; no private Paytm data; no pressure tactics.
 *   5. Human in the loop: "review" mode queues every draft for approval; "auto" sends only low-risk ones (no price
 *      change, not a lost deal) at the shop's quietest hour. Anything else always waits for the seller.
 */

export type Cohort = "NO_REPLY" | "WENT_QUIET" | "OBJECTION_STALLED" | "SAMPLE_CHECKIN" | "LOST_REVIVE";
export const COHORT_LABELS: Record<Cohort, string> = {
  NO_REPLY: "Never replied",
  WENT_QUIET: "Went quiet",
  OBJECTION_STALLED: "Stuck on an objection",
  SAMPLE_CHECKIN: "Sample sent, no feedback",
  LOST_REVIVE: "Lost deal",
};

export const POLICY = { minSilenceDays: 4, gapDays: 4, maxUnanswered: 3, lostCoolDays: 14, notInterestedCoolDays: 30, maxWords: 60, dailyCap: 10 };
export type Policy = typeof POLICY;

export type FollowupMessage = { direction: "in" | "out"; at: Date; text: string };
export type FollowupInput = {
  stage: string;
  objection: string | null;
  ownerFirst: string;
  sellerFirst: string;
  sellerName: string;
  distanceKm: number;
  messages: FollowupMessage[]; // oldest first
  memories: { kind: string; category: string | null; summary: string; createdAt: Date }[];
  signals: { type: string; title: string; date: string }[];
  /** Follow-ups already sent on this deal, oldest first, with the template used. */
  sent: { at: Date; templateId: string }[];
  /** When the deal became LOST (last activity if unknown). */
  lostAt?: Date | null;
};

export type Check = { id: string; label: string; ok: boolean; detail: string };
export type Reason = { code: "NEW_TIER" | "CREDIT" | "FESTIVE" | "SAMPLE_OPEN" | "SAMPLE_FEEDBACK" | "LAST_NUDGE" | "BACKUP_SUPPLIER" | "QUALITY_PROOF"; text: string };
export type Evaluation =
  | { eligible: true; cohort: Cohort; attempt: number; silentDays: number; reason: Reason; templateId: string; text: string; risk: "low" | "review"; checks: Check[] }
  | { eligible: false; cohort: Cohort | null; silentDays: number; blockedBy: Check | null; checks: Check[] };

const DAY = 86_400_000;
const days = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / DAY);

export const OPT_OUT = /\b(stop|unsubscribe|don'?t (message|text|contact)|band karo|mat bhejo|message mat|msg mat|call mat|pareshan mat|disturb mat|nahi chahiye,? (mat|band))\b/i;
const PRIVATE = /\b(payment|payments|transaction|transactions|receipts?|revenue|turnover|sales data|qr (volume|receipts))\b/i;
const PRESSURE = /\b(last chance|urgent|hurry|jaldi karo|offer khatam|limited time|aaj hi|abhi ke abhi|final offer|warna)\b/i;

/** Which follow-up situation a deal is in, or null if it isn't one we follow up on. */
export function cohortFor(input: FollowupInput): Cohort | null {
  if (["ORDER_WON", "MEETING_BOOKED", "SAMPLE_REQUESTED", "NEW"].includes(input.stage)) return null;
  if (input.stage === "LOST") return "LOST_REVIVE";
  if (input.stage === "SAMPLE_SENT") return "SAMPLE_CHECKIN";
  if (input.stage === "OBJECTION") return "OBJECTION_STALLED";
  const replied = input.messages.some((m) => m.direction === "in");
  return replied ? "WENT_QUIET" : "NO_REPLY";
}

/** A reason that is new since the buyer last heard from us. Null means: don't message. */
export function newReason(input: FollowupInput, cohort: Cohort, offers: SellerOffers, now: Date, attempt: number): Reason | null {
  const lastOut = [...input.messages].reverse().find((m) => m.direction === "out")?.at ?? new Date(0);
  const since = cohort === "LOST_REVIVE" && input.lostAt ? input.lostAt : lastOut;
  const tier = offers.tiers.find((t) => new Date(`${t.launchedOn}T12:00:00+05:30`) > since);
  const festive = input.signals.find((s) => s.type === "FESTIVE_SEASON" && days(new Date(`${s.date}T12:00:00+05:30`), now) <= 30 && days(new Date(`${s.date}T12:00:00+05:30`), now) >= -21);
  const objection = input.objection;
  const priceObjection = objection === "PRICE_TOO_HIGH" || objection === "BULK_ONLY_MOQ";
  if (cohort === "SAMPLE_CHECKIN") return { code: "SAMPLE_FEEDBACK", text: "Sample was delivered; ask how it went" };
  if (tier && (priceObjection || cohort === "LOST_REVIVE" || cohort === "NO_REPLY" || cohort === "WENT_QUIET")) return { code: "NEW_TIER", text: `New bulk price ${rupees(tier.unitPriceInr)} (${tier.minQty.toLocaleString("en-IN")}+) launched after we last spoke` };
  if (objection === "CREDIT_TERMS" && offers.credit.viaPaytmPostpaid) return { code: "CREDIT", text: `${offers.credit.days}-day credit via Paytm Postpaid answers their credit ask` };
  if (objection === "HAS_SUPPLIER") return { code: "BACKUP_SUPPLIER", text: "Offer to be a nearby backup supplier for the festive rush" };
  if (objection === "QUALITY_DOUBT" && offers.freeSample.enabled) return { code: "QUALITY_PROOF", text: "A free sample lets them check quality with no commitment" };
  if (festive) return { code: "FESTIVE", text: `${festive.title}: packaging demand is up` };
  if (cohort === "LOST_REVIVE") return null; // lost deals need something genuinely new
  if (attempt === 1 && offers.freeSample.enabled) return { code: "SAMPLE_OPEN", text: "The free sample offer is still open" };
  if (attempt >= POLICY.maxUnanswered) return { code: "LAST_NUDGE", text: "Polite last message: leave the door open, no more follow-ups after this" };
  return offers.freeSample.enabled ? { code: "SAMPLE_OPEN", text: "The free sample offer is still open" } : null;
}

type TemplateCtx = { name: string; seller: string; business: string; km: string; offers: SellerOffers };
type Template = { id: string; reason: Reason["code"]; risk: "low" | "review"; render: (c: TemplateCtx) => string };
const hi = (name: string) => (name ? `Namaste ${name} ji` : "Namaste ji");
const tierLine = (o: SellerOffers) => { const t = o.tiers[0]; return t ? `${t.minQty.toLocaleString("en-IN")}+ pcs pe sirf ${rupees(t.unitPriceInr)}` : ""; };

/** Vetted templates. Every one states the reason, asks one easy question, and uses only offer-sheet facts. */
export const TEMPLATES: Template[] = [
  { id: "sample_open", reason: "SAMPLE_OPEN", risk: "low", render: (c) => `${hi(c.name)} 🙏 ${c.seller} yahan, ${c.business} se. Aapke liye free sample (${c.offers.freeSample.contents}) abhi bhi rakha hai, koi commitment nahi. Kal bhijwa doon?` },
  { id: "new_tier", reason: "NEW_TIER", risk: "review", render: (c) => `${hi(c.name)} 🙏 ${c.seller}, ${c.business} se. Ek nayi baat: ab ${tierLine(c.offers)}, same-day delivery ke saath. Pehle free sample bhej doon, quality dekh lijiye?` },
  { id: "credit", reason: "CREDIT", risk: "review", render: (c) => `${hi(c.name)} 🙏 Aapne credit ki baat ki thi. Ab ${c.offers.credit.days} din ka credit Paytm Postpaid se mil jaata hai, abhi kuch pay nahi karna. Pehla order chhota rakh ke try karein?` },
  { id: "backup_supplier", reason: "BACKUP_SUPPLIER", risk: "low", render: (c) => `${hi(c.name)} 🙏 Aapka supplier fix hai, samajh sakta hoon. Festive rush mein ek backup rakhna kaam aata hai: hum ${c.km} door hain, ${c.offers.sameDayCutoff} tak order pe same-day delivery. Number save kar lijiye?` },
  { id: "quality_proof", reason: "QUALITY_PROOF", risk: "low", render: (c) => `${hi(c.name)} 🙏 Quality ki chinta sahi hai. Free sample (${c.offers.freeSample.contents}) bhejta hoon, khud check kar lijiye, koi commitment nahi. Kal subah theek rahega?` },
  { id: "festive", reason: "FESTIVE", risk: "low", render: (c) => `${hi(c.name)} 🙏 Tyohaar ka season aa raha hai, packaging ki zaroorat badhegi. Hum ${c.km} door hain, same-day delivery. Free sample bhej doon?` },
  { id: "sample_feedback", reason: "SAMPLE_FEEDBACK", risk: "low", render: (c) => `${hi(c.name)} 🙏 Sample kaisa laga? Kisi size ya design mein badlav chahiye toh bataiye, waisa bana denge.` },
  { id: "last_nudge", reason: "LAST_NUDGE", risk: "low", render: (c) => `${hi(c.name)} 🙏 Aapko pareshan nahi karunga. Kabhi packaging ki zaroorat ho toh bas "haan" likh dijiye, ${c.seller} turant contact karega. Dhanyavaad!` },
];

/** Content guardrails, applied to templates and to any AI-personalised text. */
export function contentChecks(text: string, offers: SellerOffers, maxWords = POLICY.maxWords): Check[] {
  const allowed = new Set<number>([...offers.catalog.map((c) => c.unitPriceInr), ...offers.tiers.map((t) => t.unitPriceInr)]);
  const prices = [...text.matchAll(/₹\s?(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  const badPrice = prices.find((p) => !allowed.has(p));
  const words = text.trim().split(/\s+/).length;
  const questions = (text.match(/\?/g) ?? []).length;
  return [
    { id: "length", label: "Short", ok: words <= maxWords, detail: `${words} words (max ${maxWords})` },
    { id: "prices", label: "Real prices only", ok: badPrice === undefined, detail: badPrice === undefined ? (prices.length ? "Every price is on your offer sheet" : "No prices quoted") : `₹${badPrice} is not on your offer sheet` },
    { id: "private", label: "No private Paytm data", ok: !PRIVATE.test(text), detail: PRIVATE.test(text) ? "Mentions payments or sales data" : "Nothing from Paytm transaction data" },
    { id: "pressure", label: "No pressure", ok: !PRESSURE.test(text), detail: PRESSURE.test(text) ? "Uses pressure words" : "No 'last chance' style pressure" },
    { id: "one_ask", label: "One clear ask", ok: questions <= 1, detail: `${questions} question${questions === 1 ? "" : "s"}` },
  ];
}

/** Decides whether to follow up, why, with which template, and records every guardrail it checked. */
export function evaluateFollowup(input: FollowupInput, offers: SellerOffers, now: Date, policy: Policy = POLICY): Evaluation {
  const msgs = [...input.messages].sort((a, b) => a.at.getTime() - b.at.getTime());
  const last = msgs.at(-1);
  const lastIn = [...msgs].reverse().find((m) => m.direction === "in");
  const silentDays = last ? days(last.at, now) : 0;
  const cohort = cohortFor(input);
  const unanswered = input.sent.filter((s) => !lastIn || s.at > lastIn.at);
  const lastSent = input.sent.at(-1);
  const optOut = msgs.find((m) => m.direction === "in" && OPT_OUT.test(m.text));
  const notInterested = input.memories.some((m) => m.category === "NOT_INTERESTED");
  const lostDays = input.lostAt ? days(input.lostAt, now) : silentDays;

  const checks: Check[] = [
    { id: "opt_out", label: "Hasn't asked us to stop", ok: !optOut, detail: optOut ? `Said: "${optOut.text.slice(0, 60)}"` : "No stop / don't-message words in their replies" },
    { id: "stage", label: "Right stage for a follow-up", ok: cohort !== null, detail: cohort ? COHORT_LABELS[cohort] : `Stage ${input.stage}: nothing to follow up` },
    // An objection is the buyer's turn too: we follow up on it with a new reason. Otherwise their message is waiting on us.
    { id: "our_turn", label: "Not waiting on you", ok: !(last?.direction === "in" && cohort !== "OBJECTION_STALLED" && cohort !== "LOST_REVIVE"), detail: last?.direction === "in" && cohort !== "OBJECTION_STALLED" && cohort !== "LOST_REVIVE" ? "Their last message needs your reply, not a follow-up" : "Ball is in their court" },
    { id: "silence", label: `Quiet ${policy.minSilenceDays}+ days`, ok: silentDays >= policy.minSilenceDays, detail: `${silentDays} day${silentDays === 1 ? "" : "s"} since the last message` },
    { id: "gap", label: `${policy.gapDays}+ days since last follow-up`, ok: !lastSent || days(lastSent.at, now) >= policy.gapDays, detail: lastSent ? `Last follow-up ${days(lastSent.at, now)} days ago` : "No follow-up yet" },
    { id: "cap", label: `At most ${policy.maxUnanswered} unanswered`, ok: unanswered.length < policy.maxUnanswered, detail: `${unanswered.length} unanswered follow-up${unanswered.length === 1 ? "" : "s"} so far` },
  ];
  if (cohort === "LOST_REVIVE") {
    const cool = notInterested ? policy.notInterestedCoolDays : policy.lostCoolDays;
    checks.push({ id: "cooldown", label: `Lost ${cool}+ days ago`, ok: lostDays >= cool, detail: `Lost ${lostDays} days ago${notInterested ? " (said not interested)" : ""}` });
  }
  const blocked = checks.find((c) => !c.ok);
  if (blocked || !cohort) return { eligible: false, cohort, silentDays, blockedBy: blocked ?? null, checks };

  const attempt = unanswered.length + 1;
  const reason = newReason(input, cohort, offers, now, attempt);
  checks.push({ id: "reason", label: "Has a new reason", ok: Boolean(reason), detail: reason?.text ?? "Nothing new to say: no message" });
  if (!reason) return { eligible: false, cohort, silentDays, blockedBy: checks.at(-1)!, checks };

  // Don't repeat a template on the same deal; fall back to the polite last nudge.
  const used = new Set(input.sent.map((s) => s.templateId));
  const template = TEMPLATES.find((t) => t.reason === reason.code && !used.has(t.id)) ?? TEMPLATES.find((t) => !used.has(t.id) && t.reason === "LAST_NUDGE");
  if (!template) {
    checks.push({ id: "fresh", label: "Not repeating ourselves", ok: false, detail: "Every suitable template was already used" });
    return { eligible: false, cohort, silentDays, blockedBy: checks.at(-1)!, checks };
  }
  const text = template.render({ name: input.ownerFirst, seller: input.sellerFirst, business: input.sellerName, km: `${input.distanceKm} km`, offers });
  const content = contentChecks(text, offers, policy.maxWords);
  checks.push(...content);
  const bad = content.find((c) => !c.ok);
  if (bad) return { eligible: false, cohort, silentDays, blockedBy: bad, checks };
  const risk = template.risk === "review" || cohort === "LOST_REVIVE" ? "review" : "low";
  return { eligible: true, cohort, attempt, silentDays, reason, templateId: template.id, text, risk, checks };
}
