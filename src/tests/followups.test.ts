import { describe, expect, it } from "vitest";
import { contentChecks, evaluateFollowup, type FollowupInput } from "@/lib/vyapar/followups";
import type { SellerOffers } from "@/lib/vyapar/taxonomy";

const offers: SellerOffers = {
  catalog: [{ sku: "PB-S", name: "Paper carry bag (small)", unitPriceInr: 5, inStock: true, servesCategories: ["Bakery"] }],
  tiers: [{ minQty: 1000, unitPriceInr: 4.2, label: "Bulk tier", launchedOn: "2026-10-01" }],
  freeSample: { enabled: true, perWeek: 20, contents: "25 bags + 10 pastry boxes" },
  credit: { days: 15, viaPaytmPostpaid: true }, deliveryRadiusKm: 8, sameDayCutoff: "2 PM", moq: 200, maxMonthlyUnitsPerBuyer: null, proofPoints: [],
};
const now = new Date("2026-10-04T12:00:00+05:30");
const at = (iso: string) => new Date(`${iso}T11:00:00+05:30`);
const base = (over: Partial<FollowupInput>): FollowupInput => ({
  stage: "PITCHED", objection: null, ownerFirst: "Aman", sellerFirst: "Rahul", sellerName: "EcoPack Solutions", distanceKm: 4.9,
  messages: [{ direction: "out", at: at("2026-09-25"), text: "Namaste Aman ji..." }], memories: [], signals: [], sent: [], ...over,
});

describe("follow-up agent", () => {
  it("follows up a cold lead after 4+ silent days, with a new reason and a vetted template", () => {
    const e = evaluateFollowup(base({}), offers, now);
    expect(e.eligible).toBe(true);
    if (!e.eligible) return;
    expect(e.cohort).toBe("NO_REPLY");
    expect(e.reason.code).toBe("NEW_TIER"); // the ₹4.20 tier launched after the pitch
    expect(e.text).toContain("₹4.20");
    expect(e.risk).toBe("review"); // price changes always need the seller's approval
    expect(e.checks.every((c) => c.ok)).toBe(true);
  });

  it("waits until 4 days of silence", () => {
    const e = evaluateFollowup(base({ messages: [{ direction: "out", at: at("2026-10-02"), text: "hi" }] }), offers, now);
    expect(e.eligible).toBe(false);
    if (!e.eligible) expect(e.blockedBy?.id).toBe("silence");
  });

  it("never messages someone who asked us to stop", () => {
    const e = evaluateFollowup(base({ stage: "LOST", lostAt: at("2026-09-01"), messages: [{ direction: "out", at: at("2026-08-30"), text: "pitch" }, { direction: "in", at: at("2026-09-01"), text: "Bhai message mat bhejo" }] }), offers, now);
    expect(e.eligible).toBe(false);
    if (!e.eligible) expect(e.blockedBy?.id).toBe("opt_out");
  });

  it("doesn't follow up when the buyer is waiting on us", () => {
    const e = evaluateFollowup(base({ stage: "REPLIED", messages: [{ direction: "out", at: at("2026-09-20"), text: "pitch" }, { direction: "in", at: at("2026-09-21"), text: "Price list bhejo" }] }), offers, now);
    expect(e.eligible).toBe(false);
    if (!e.eligible) expect(e.blockedBy?.id).toBe("our_turn");
  });

  it("stops after 3 unanswered follow-ups and spaces them 4+ days apart", () => {
    const three = evaluateFollowup(base({ sent: [{ at: at("2026-09-10"), templateId: "sample_open" }, { at: at("2026-09-15"), templateId: "festive" }, { at: at("2026-09-20"), templateId: "new_tier" }] }), offers, now);
    expect(three.eligible).toBe(false);
    if (!three.eligible) expect(three.blockedBy?.id).toBe("cap");
    const recent = evaluateFollowup(base({ sent: [{ at: at("2026-10-02"), templateId: "sample_open" }] }), offers, now);
    if (!recent.eligible) expect(recent.blockedBy?.id).toBe("gap");
  });

  it("revives a lost deal only after the cool-down and only with something new", () => {
    const lost = (lostAt: string) => base({ stage: "LOST", objection: "NOT_NOW", lostAt: at(lostAt), messages: [{ direction: "out", at: at("2026-09-10"), text: "pitch" }, { direction: "in", at: at(lostAt), text: "Abhi zaroorat nahi" }] });
    const early = evaluateFollowup(lost("2026-09-28"), offers, now);
    if (!early.eligible) expect(early.blockedBy?.id).toBe("cooldown");
    const ok = evaluateFollowup(lost("2026-09-14"), offers, now);
    expect(ok.eligible).toBe(true);
    if (ok.eligible) { expect(ok.reason.code).toBe("NEW_TIER"); expect(ok.risk).toBe("review"); }
    const nothingNew = evaluateFollowup(lost("2026-10-02"), { ...offers, tiers: [] }, new Date("2026-11-20T12:00:00+05:30"));
    if (!nothingNew.eligible) expect(nothingNew.blockedBy?.id).toBe("reason");
  });

  it("answers the specific objection (credit, supplier, quality) and checks in after a sample", () => {
    const credit = evaluateFollowup(base({ stage: "OBJECTION", objection: "CREDIT_TERMS", messages: [{ direction: "out", at: at("2026-09-29"), text: "p" }, { direction: "in", at: at("2026-09-30"), text: "60 din ka credit" }] }), offers, now);
    expect(credit.eligible).toBe(true);
    if (credit.eligible) expect(credit.templateId).toBe("credit");
    const sample = evaluateFollowup(base({ stage: "SAMPLE_SENT", messages: [{ direction: "in", at: at("2026-09-29"), text: "sample bhejo" }, { direction: "out", at: at("2026-09-30"), text: "Done" }] }), offers, now);
    expect(sample.eligible).toBe(true);
    if (sample.eligible) { expect(sample.templateId).toBe("sample_feedback"); expect(sample.risk).toBe("low"); }
  });

  it("rejects invented prices, private data and pressure in any draft", () => {
    const bad = contentChecks("Sirf ₹3 mein! Last chance, aapke payments dekh ke offer diya hai. Lenge? Pakka?", offers);
    expect(bad.filter((c) => !c.ok).map((c) => c.id).sort()).toEqual(["one_ask", "pressure", "prices", "private"]);
    expect(contentChecks("1,000+ pcs pe sirf ₹4.20. Sample bhej doon?", offers).every((c) => c.ok)).toBe(true);
  });
});
