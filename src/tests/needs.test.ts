import { describe, expect, it } from "vitest";
import { compareMatches, evaluateNeedMatch, missingFields, parseNeed, quoteFor, type Need, type Offer } from "@/lib/vyapar/needs";

const now = new Date("2026-10-04T12:00:00+05:30"); // Sunday
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const base: Offer = {
  id: "o1", sellerMerchantId: "s1", productKey: "pastry_box", name: "Pastry box 6 inch", unit: "box", unitPricePaise: 900,
  tiers: [{ minQty: 1000, unitPricePaise: 800 }], moq: 200, stockQty: 3000, stockStatus: "CONFIRMED", confirmedAt: hoursAgo(3),
  deliveryRadiusKm: 8, leadTimeHours: 24, sampleAvailable: true, sampleNote: "Free sample pack",
};
const need: Need = { productKey: "pastry_box", quantity: 500, maxUnitPricePaise: 1000, neededBy: "2026-10-09", sampleFirst: true };

describe("parseNeed", () => {
  it("reads Karan's request: product, quantity, budget, Friday, sample", () => {
    const d = parseNeed("Need 500 grease-resistant pastry boxes by Friday, max ₹10 each; sample first.", now);
    expect(d).toMatchObject({ productKey: "pastry_box", quantity: 500, maxUnitPriceInr: 10, neededBy: "2026-10-09", sampleFirst: true });
  });
  it("understands Hinglish and leaves unknowns as null", () => {
    const d = parseNeed("1000 paper bags chahiye 3 din mein, abhi wala supplier late hai, backup chahiye", now);
    expect(d).toMatchObject({ productKey: "paper_bag", quantity: 1000, neededBy: "2026-10-07", backupSupplier: true, maxUnitPriceInr: null });
    expect(missingFields(parseNeed("kuch boxes chahiye", now))).toEqual(["product", "quantity", "needed-by date"]);
  });
});

describe("quote", () => {
  it("applies the tier only at or above its minimum quantity", () => {
    expect(quoteFor(base, 999).unitPricePaise).toBe(900);
    expect(quoteFor(base, 1000).unitPricePaise).toBe(800);
    expect(quoteFor(base, 500).subtotalPaise).toBe(450000);
  });
});

describe("evaluateNeedMatch", () => {
  it("is READY when every criterion passes", () => {
    const m = evaluateNeedMatch(need, base, 2.1, now);
    expect(m.eligibility).toBe("READY");
    expect(m.quote?.subtotalPaise).toBe(450000);
  });
  it("excludes on MOQ, delivery area, deadline, budget, wrong product and missing sample", () => {
    expect(evaluateNeedMatch(need, { ...base, moq: 1000 }, 2, now).reason).toMatch(/Minimum order is 1,000/);
    expect(evaluateNeedMatch(need, { ...base, deliveryRadiusKm: 3 }, 6, now).reason).toMatch(/Outside their delivery area/);
    expect(evaluateNeedMatch(need, { ...base, leadTimeHours: 7 * 24 }, 2, now).reason).toMatch(/after your date/);
    expect(evaluateNeedMatch(need, { ...base, unitPricePaise: 1400, tiers: [] }, 2, now).reason).toMatch(/above your ₹10/);
    expect(evaluateNeedMatch(need, { ...base, productKey: "paper_bag", unit: "bag" }, 2, now).eligibility).toBe("EXCLUDED");
    expect(evaluateNeedMatch(need, { ...base, sampleAvailable: false }, 2, now).reason).toBe("No samples");
  });
  it("puts stale or unconfirmed stock in Needs confirmation, never Ready", () => {
    expect(evaluateNeedMatch(need, { ...base, confirmedAt: hoursAgo(5 * 24) }, 2, now).eligibility).toBe("NEEDS_CONFIRMATION");
    expect(evaluateNeedMatch(need, { ...base, stockStatus: "UNKNOWN", confirmedAt: null }, 2, now).reason).toBe("Stock not confirmed");
  });
  it("treats an unknown budget as a disclosure, not a rejection", () => {
    expect(evaluateNeedMatch({ ...need, maxUnitPricePaise: null }, { ...base, unitPricePaise: 5000, tiers: [] }, 2, now).eligibility).toBe("READY");
  });
  it("accepts a delivery exactly on the deadline day and rejects the day after", () => {
    const sat = { ...need, neededBy: "2026-10-05" };
    expect(evaluateNeedMatch(sat, { ...base, leadTimeHours: 24 }, 2, now).eligibility).toBe("READY");
    expect(evaluateNeedMatch(sat, { ...base, leadTimeHours: 48 }, 2, now).eligibility).toBe("EXCLUDED");
  });
});

describe("compareMatches", () => {
  it("shows at most three distinct sellers, cheapest first, with a stable order", () => {
    const offers: Offer[] = [
      { ...base, id: "a", sellerMerchantId: "s1", unitPricePaise: 950, tiers: [] },
      { ...base, id: "b", sellerMerchantId: "s1", unitPricePaise: 920, tiers: [] },
      { ...base, id: "c", sellerMerchantId: "s2", unitPricePaise: 900, tiers: [] },
      { ...base, id: "d", sellerMerchantId: "s3", unitPricePaise: 850, tiers: [] },
      { ...base, id: "e", sellerMerchantId: "s4", unitPricePaise: 990, tiers: [] },
    ];
    const r = compareMatches(offers.map((o) => evaluateNeedMatch(need, o, 2, now)));
    expect(r.top.map((m) => m.offerId)).toEqual(["d", "c", "b"]);
    expect(r.moreReady).toBe(2);
  });
});
