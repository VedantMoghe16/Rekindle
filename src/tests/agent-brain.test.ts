import { describe, expect, it } from "vitest";
import { counterFor, lastBuyerTurn, offerSheet, parseObjections, parseQty, quote, topPlays, truncateWords } from "@/lib/vyapar/agent-brain";
import type { SellerOffers } from "@/lib/vyapar/taxonomy";

const offers: SellerOffers = {
  catalog: [
    { sku: "PX-6", name: "Pastry box 6 inch", unitPriceInr: 9, inStock: true, servesCategories: ["Bakery"] },
    { sku: "PB-S", name: "Paper carry bag (small)", unitPriceInr: 5, inStock: true, servesCategories: ["Bakery"] },
  ],
  tiers: [{ minQty: 1000, unitPriceInr: 4.2, label: "Bulk tier", launchedOn: "2026-10-01" }],
  freeSample: { enabled: true, perWeek: 20, contents: "25 bags + 10 pastry boxes" },
  credit: { days: 15, viaPaytmPostpaid: true }, deliveryRadiusKm: 8, sameDayCutoff: "2 PM", moq: 200, maxMonthlyUnitsPerBuyer: null, proofPoints: [],
};

describe("agent brain (mid-call tools)", () => {
  it("quotes real prices from tiers and never invents a discount", () => {
    expect(quote(offers, 1000).say).toBe("1,000 bags = ₹4,200 (₹4.20 per bag).");
    expect(quote(offers, 500).say).toContain("1,000+ pe ₹4.20");
    expect(quote(offers, 100).say).toContain("Minimum order 200");
    expect(quote(offers, 50, "PX-6").totalInr).toBe(450);
  });
  it("parses quantities and objections the agent sends", () => {
    expect(parseQty("1,500 bags chahiye")).toBe(1500);
    expect(parseQty("do hazaar")).toBe(2000);
    expect(parseObjections("price, existing_supplier")).toEqual(["PRICE_TOO_HIGH", "HAS_SUPPLIER"]);
    expect(parseObjections("bahut mehenga hai")).toEqual(["PRICE_TOO_HIGH"]);
  });
  it("reads the buyer's last turn from a transcript", () => {
    expect(lastBuyerTurn([{ role: "agent", en_text: "hi" }, { role: "user", en_text: "too costly" }])).toBe("too costly");
    expect(lastBuyerTurn("agent: hello\nuser: rate zyada hai")).toBe("rate zyada hai");
  });
  it("returns a ≤25-word counter using the best play and the competitor price", () => {
    const c = counterFor({ objections: ["PRICE_TOO_HIGH", "HAS_SUPPLIER"], buyerText: "Abhi wale supplier se ₹3.50 mein aata hai", buyerFirstName: "Karan", sellerFirstName: "Rahul", offers });
    expect(c.play).toBe("bulk_tier");
    expect(c.say.split(" ").length).toBeLessThanOrEqual(26);
    expect(c.followUpFor).toBe("HAS_SUPPLIER");
  });
  it("builds the offer sheet and top plays", () => {
    expect(offerSheet(offers)).toContain("Paper carry bag (small) ₹5 (1,000+: ₹4.20)");
    expect(topPlays(["CREDIT_TERMS"])[0]).toMatch(/credit/i);
    expect(truncateWords("a b c d", 2)).toBe("a b…");
  });
});
