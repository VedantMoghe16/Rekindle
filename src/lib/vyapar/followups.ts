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
export type Reason = { code: "PROMISE" | "NEW_TIER" | "CREDIT" | "FESTIVE" | "SAMPLE_OPEN" | "SAMPLE_FEEDBACK" | "LAST_NUDGE" | "BACKUP_SUPPLIER" | "QUALITY_PROOF"; text: string };
export type Channel = "text" | "voice";
export type TemplateStats = Record<string, { sent: number; replied: number }>;

// ---------- Promises: "after Diwali", "next week", "ek mahine ka stock hai" → the date they told us ----------

/** Festival dates the agent understands (IST). */
export const FESTIVALS: Record<string, string> = { diwali: "2026-11-08", dhanteras: "2026-11-06", navratri: "2026-10-11", dussehra: "2026-10-20", holi: "2027-03-22", eid: "2027-03-10", "new year": "2027-01-01" };
const WEEKDAYS: [RegExp, number][] = [[/\b(sunday|ravivar|itwar)\b/, 0], [/\b(monday|somvar|somvaar)\b/, 1], [/\b(tuesday|mangalvar|mangal)\b/, 2], [/\b(wednesday|budhvar|budh)\b/, 3], [/\b(thursday|guruvar|veervar)\b/, 4], [/\b(friday|shukravar|shukra)\b/, 5], [/\b(saturday|shanivar|shani)\b/, 6]];
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000);
const dayAt = (base: Date, addDays: number) => { const x = ist(base); return new Date(`${x.toISOString().slice(0, 10)}T11:00:00+05:30`).getTime() + addDays * 86_400_000; };

/** When the buyer asked to be contacted again, from their own words. Null when they made no promise. */
export function promiseDate(text: string, saidAt: Date): { date: Date; phrase: string } | null {
  const t = text.toLowerCase();
  const at = (days: number, phrase: string) => ({ date: new Date(dayAt(saidAt, days)), phrase });
  for (const [name, iso] of Object.entries(FESTIVALS)) {
    const m = t.match(new RegExp(`(${name}\\s*(ke|k)?\\s*(baad|after)|after\\s+${name})`));
    if (m) return { date: new Date(new Date(`${iso}T11:00:00+05:30`).getTime() + 2 * 86_400_000), phrase: m[0] };
    const before = t.match(new RegExp(`(${name}\\s*(se)?\\s*(pehle|before)|before\\s+${name})`));
    if (before) return { date: new Date(new Date(`${iso}T11:00:00+05:30`).getTime() - 14 * 86_400_000), phrase: before[0] };
  }
  // "10 din baad" / "in 10 days" are promises; "60 din ka credit" is a payment term, not a date.
  const n = t.match(/(\d+)\s*(din|days?)\s*(ke\s*)?(baad|later)|(?:in|after)\s+(\d+)\s+days?/);
  if (n) return at(Number(n[1] ?? n[5]), n[0]);
  const w = t.match(/(\d+)\s*(hafte|hafta|weeks?)\s*(ke\s*)?(baad|later)|(?:in|after)\s+(\d+)\s+weeks?/);
  if (w) return at(Number(w[1] ?? w[5]) * 7, w[0]);
  let m = t.match(/next week|agle hafte|agle week|next hafte/);
  if (m) return at(7, m[0]);
  m = t.match(/next month|agle mahine|ek mahine|1 mahine|mahine (ka|bhar ka) stock|month ka stock/);
  if (m) return at(28, m[0]);
  m = t.match(/\bparso\b|day after tomorrow/);
  if (m) return at(2, m[0]);
  m = t.match(/\bkal\b|\btomorrow\b/);
  if (m && !/kal (wala|wali|aaya|bheja)/.test(t)) return at(1, m[0]);
  for (const [re, wd] of WEEKDAYS) {
    const hit = t.match(re);
    if (hit) { const d = ist(saidAt).getUTCDay(); return at(((wd - d + 7) % 7) || 7, hit[0]); }
  }
  m = t.match(/(\d{1,2})\s*(tareekh|tarikh|tarik|st|nd|rd|th)\b/);
  if (m) {
    const x = ist(saidAt); const day = Number(m[1]);
    const target = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + (day > x.getUTCDate() ? 0 : 1), day));
    return { date: new Date(`${target.toISOString().slice(0, 10)}T11:00:00+05:30`), phrase: m[0] };
  }
  return null;
}

/** Latest promise from the buyer (their messages, or a timing memory such as a call-back the voice agent noted). */
export function latestPromise(input: Pick<FollowupInput, "messages" | "memories">): { date: Date; phrase: string; quote: string; saidAt: Date } | null {
  const said = [
    ...input.messages.filter((m) => m.direction === "in").map((m) => ({ text: m.text, at: m.at })),
    ...input.memories.filter((m) => m.kind === "TIMING").map((m) => ({ text: m.summary, at: m.createdAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  for (const s of said) {
    const p = promiseDate(s.text, s.at);
    if (p) return { ...p, quote: s.text, saidAt: s.at };
  }
  return null;
}

// ---------- Learning: pick the template variant that gets replies ----------

/** Demo benchmark so the agent has a starting point before it has its own history (labelled as demo in the UI). */
export const BENCHMARK: TemplateStats = {
  sample_open: { sent: 40, replied: 9 }, sample_open_b: { sent: 40, replied: 14 },
  new_tier: { sent: 30, replied: 11 }, new_tier_b: { sent: 30, replied: 8 },
  quality_proof: { sent: 20, replied: 7 }, quality_proof_b: { sent: 20, replied: 5 },
  backup_supplier: { sent: 20, replied: 4 }, credit: { sent: 15, replied: 6 }, festive: { sent: 25, replied: 6 },
  sample_feedback: { sent: 20, replied: 12 }, last_nudge: { sent: 30, replied: 8 }, promise: { sent: 20, replied: 11 },
};

/** Reply rate with a small prior, plus an exploration bonus for variants we've barely tried with this seller. */
export function templateScore(id: string, own: TemplateStats = {}) {
  const b = BENCHMARK[id] ?? { sent: 0, replied: 0 };
  const o = own[id] ?? { sent: 0, replied: 0 };
  const rate = (o.replied + b.replied * 0.25 + 1) / (o.sent + b.sent * 0.25 + 3);
  return { rate, explore: o.sent < 2 ? 0.04 : 0, ownSent: o.sent, ownReplied: o.replied };
}
export type Evaluation =
  | { eligible: true; cohort: Cohort; attempt: number; silentDays: number; reason: Reason; templateId: string; text: string; risk: "low" | "review"; channel: Channel; why: { template: string; channel: string }; checks: Check[] }
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
  if (cohort !== "SAMPLE_CHECKIN") {
    const promise = latestPromise(input);
    if (promise && promise.date <= now && promise.saidAt > (input.sent.at(-1)?.at ?? new Date(0))) return { code: "PROMISE", text: `They said "${promise.phrase}" on ${promise.saidAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}; that time has come` };
  }
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
type TemplateCtx2 = TemplateCtx & { quote?: string; phrase?: string };
type Template = { id: string; label: string; reason: Reason["code"]; risk: "low" | "review"; render: (c: TemplateCtx2) => string };
const hi = (name: string) => (name ? `Namaste ${name} ji` : "Namaste ji");
const tierLine = (o: SellerOffers) => { const t = o.tiers[0]; return t ? `${t.minQty.toLocaleString("en-IN")}+ pcs pe sirf ${rupees(t.unitPriceInr)}` : ""; };

/** Vetted templates. Every one states the reason, asks one easy question, and uses only offer-sheet facts. */
export const TEMPLATES: Template[] = [
  { id: "promise", label: "Kept their timing", reason: "PROMISE", risk: "low", render: (c) => `${hi(c.name)} 🙏 Aapne kaha tha "${c.phrase}" baat karenge, isliye yaad dila raha hoon. Free sample (${c.offers.freeSample.contents}) se shuru karein?` },
  { id: "sample_open", label: "Free sample still open", reason: "SAMPLE_OPEN", risk: "low", render: (c) => `${hi(c.name)} 🙏 ${c.seller} yahan, ${c.business} se. Aapke liye free sample (${c.offers.freeSample.contents}) abhi bhi rakha hai, koi commitment nahi. Kal bhijwa doon?` },
  { id: "sample_open_b", label: "Sample, one-word reply", reason: "SAMPLE_OPEN", risk: "low", render: (c) => `${hi(c.name)} 🙏 Ek chhota sa sawaal: free sample (${c.offers.freeSample.contents}) bhej doon? Bas "haan" likh dijiye, baaki main dekh lunga.` },
  { id: "new_tier", label: "New bulk price", reason: "NEW_TIER", risk: "review", render: (c) => `${hi(c.name)} 🙏 ${c.seller}, ${c.business} se. Ek nayi baat: ab ${tierLine(c.offers)}, same-day delivery ke saath. Pehle free sample bhej doon, quality dekh lijiye?` },
  { id: "new_tier_b", label: "Bulk price, savings first", reason: "NEW_TIER", risk: "review", render: (c) => `${hi(c.name)} 🙏 Aapke liye kaam ki khabar: ${tierLine(c.offers)} ho gaya hai, ${c.km} door se same-day delivery. Rate sheet bhej doon?` },
  { id: "credit", label: "Pay later via Postpaid", reason: "CREDIT", risk: "review", render: (c) => `${hi(c.name)} 🙏 Aapne credit ki baat ki thi. Ab ${c.offers.credit.days} din ka credit Paytm Postpaid se mil jaata hai, abhi kuch pay nahi karna. Pehla order chhota rakh ke try karein?` },
  { id: "backup_supplier", label: "Be their backup", reason: "BACKUP_SUPPLIER", risk: "low", render: (c) => `${hi(c.name)} 🙏 Aapka supplier fix hai, samajh sakta hoon. Festive rush mein ek backup rakhna kaam aata hai: hum ${c.km} door hain, ${c.offers.sameDayCutoff} tak order pe same-day delivery. Number save kar lijiye?` },
  { id: "quality_proof", label: "Check quality yourself", reason: "QUALITY_PROOF", risk: "low", render: (c) => `${hi(c.name)} 🙏 Quality ki chinta sahi hai. Free sample (${c.offers.freeSample.contents}) bhejta hoon, khud check kar lijiye, koi commitment nahi. Kal subah theek rahega?` },
  { id: "quality_proof_b", label: "Quality, replace if weak", reason: "QUALITY_PROOF", risk: "low", render: (c) => `${hi(c.name)} 🙏 Aapne boxes kamzor hone ki baat kahi thi. Hamare sample try kijiye; pasand na aaye toh koi baat nahi. Sample bhej doon?` },
  { id: "festive", label: "Festive demand", reason: "FESTIVE", risk: "low", render: (c) => `${hi(c.name)} 🙏 Tyohaar ka season aa raha hai, packaging ki zaroorat badhegi. Hum ${c.km} door hain, same-day delivery. Free sample bhej doon?` },
  { id: "sample_feedback", label: "How was the sample?", reason: "SAMPLE_FEEDBACK", risk: "low", render: (c) => `${hi(c.name)} 🙏 Sample kaisa laga? Kisi size ya design mein badlav chahiye toh bataiye, waisa bana denge.` },
  { id: "last_nudge", label: "Polite last message", reason: "LAST_NUDGE", risk: "low", render: (c) => `${hi(c.name)} 🙏 Aapko pareshan nahi karunga. Kabhi packaging ki zaroorat ho toh bas "haan" likh dijiye, ${c.seller} turant contact karega. Dhanyavaad!` },
];
export const TEMPLATE_LABELS = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.label]));

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
export function evaluateFollowup(input: FollowupInput, offers: SellerOffers, now: Date, policy: Policy = POLICY, stats: TemplateStats = {}): Evaluation {
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
  // Respect the buyer's own timing: no nudges before the date they gave; on that date, the promise is the reason.
  const promise = cohort === "SAMPLE_CHECKIN" ? null : latestPromise({ messages: msgs, memories: input.memories });
  const promiseOpen = promise && promise.saidAt > (lastSent?.at ?? new Date(0));
  if (promiseOpen && promise.date > now) checks.push({ id: "promise_wait", label: "Respecting their timing", ok: false, detail: `They said "${promise.phrase}": following up on ${promise.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}` });
  else if (promiseOpen) {
    // The promised date has come: that's reason enough, even if a lost deal's cool-down or the silence window isn't over.
    for (const c of checks) if ((c.id === "silence" && silentDays >= 1) || c.id === "our_turn") c.ok = true;
    checks.push({ id: "promise_due", label: "Their promised date has come", ok: true, detail: `They said "${promise.phrase}"` });
  }
  if (cohort === "LOST_REVIVE" && !(promiseOpen && promise.date <= now)) {
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
  // Learning: among the unused variants for this reason, use the one with the best reply rate.
  const used = new Set(input.sent.map((s) => s.templateId));
  const ranked = TEMPLATES.filter((t) => t.reason === reason.code && !used.has(t.id)).map((t) => ({ t, s: templateScore(t.id, stats) })).sort((a, b) => b.s.rate + b.s.explore - (a.s.rate + a.s.explore));
  const template = ranked[0]?.t ?? TEMPLATES.find((t) => !used.has(t.id) && t.reason === "LAST_NUDGE");
  if (!template) {
    checks.push({ id: "fresh", label: "Not repeating ourselves", ok: false, detail: "Every suitable template was already used" });
    return { eligible: false, cohort, silentDays, blockedBy: checks.at(-1)!, checks };
  }
  const text = template.render({ name: input.ownerFirst, seller: input.sellerFirst, business: input.sellerName, km: `${input.distanceKm} km`, offers, phrase: promise?.phrase, quote: promise?.quote });
  const content = contentChecks(text, offers, policy.maxWords);
  checks.push(...content);
  const bad = content.find((c) => !c.ok);
  if (bad) return { eligible: false, cohort, silentDays, blockedBy: bad, checks };
  const risk = template.risk === "review" || cohort === "LOST_REVIVE" ? "review" : "low";
  // Voice note for leads that never replied to text: by the 2nd try they probably aren't reading, a voice note stands out.
  const channel: Channel = cohort === "NO_REPLY" && attempt >= 2 ? "voice" : "text";
  const score = templateScore(template.id, stats);
  const alternatives = ranked.length > 1 ? `, ahead of "${TEMPLATE_LABELS[ranked[1].t.id]}" (${Math.round(ranked[1].s.rate * 100)}%)` : "";
  return {
    eligible: true, cohort, attempt, silentDays, reason, templateId: template.id, text, risk, channel, checks,
    why: {
      template: `"${template.label}": ${Math.round(score.rate * 100)}% reply rate${score.ownSent ? ` (${score.ownReplied}/${score.ownSent} yours + benchmark)` : " (demo benchmark)"}${alternatives}`,
      channel: channel === "voice" ? `Voice note: ${attempt - 1} text${attempt > 2 ? "s" : ""} went unanswered, so they may not be reading` : "Text message",
    },
  };
}
