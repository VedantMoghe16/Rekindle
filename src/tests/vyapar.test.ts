import { describe, expect, it } from "vitest";
import merchants from "../../data/merchants.json";
import { haversineKm, radarPosition } from "@/lib/vyapar/geo";
import { parsePrompt } from "@/lib/vyapar/planner";
import { rankLeads, scoreMerchant } from "@/lib/vyapar/scoring";
import { classifyReply } from "@/lib/vyapar/replies";
import { choosePlays, stageAfterReply } from "@/lib/vyapar/counter";
import { templatePitch, validatePitch } from "@/lib/vyapar/pitch";
import { aggregateObjections, findRevivals } from "@/lib/vyapar/growth";
import { affinity, type SellerOffers } from "@/lib/vyapar/taxonomy";

const today = new Date("2026-10-04T12:00:00+05:30");
const seller = { productCategory: "Packaging", product: "Paper bags", unitPriceInr: 5, lat: 19.1150, lng: 72.8560 };
const offers: SellerOffers = {
  catalog: [
    { sku: "PX-6", name: "Pastry box 6 inch", unitPriceInr: 9, inStock: true, servesCategories: ["Bakery", "Sweet shop", "Cafe"] },
    { sku: "FB-500", name: "Food box 500 ml", unitPriceInr: 7, inStock: true, servesCategories: ["Cloud kitchen", "Restaurant", "Fast food"] },
    { sku: "PB-S", name: "Paper carry bag", unitPriceInr: 5, inStock: true, servesCategories: ["Bakery", "Sweet shop", "Cafe", "Restaurant", "Fast food", "Cloud kitchen", "Grocery"] },
  ],
  tiers: [{ minQty: 1000, unitPriceInr: 4.2, label: "Bulk tier", launchedOn: "2026-10-01" }],
  freeSample: { enabled: true, perWeek: 20, contents: "25 bags + 10 pastry boxes" },
  credit: { days: 15, viaPaytmPostpaid: true },
  deliveryRadiusKm: 8, sameDayCutoff: "2 PM", moq: 200, maxMonthlyUnitsPerBuyer: null,
  proofPoints: ["Grease-proof", "Same-day", "Used by 40+ Mumbai bakeries"],
};
const all = merchants.map((m) => ({ ...m, profile: m.profile, signals: m.signals }));
const karan = all.find((m) => m.name === "Karan's Cafe & Bakery")!;

describe("geo", () => {
  it("measures Karan's Cafe at about 2.1 km from EcoPack", () => {
    expect(haversineKm(seller, karan)).toBeCloseTo(2.1, 1);
  });
  it("places the seller at the radar centre and clamps far points", () => {
    expect(radarPosition(seller, seller, 5)).toEqual({ x: 50, y: 50 });
    const far = radarPosition(seller, { lat: seller.lat + 1, lng: seller.lng }, 5);
    expect(far.y).toBe(4);
  });
});

describe("planner", () => {
  it("compiles Rahul's prompt into categories, radius and price", () => {
    const plan = parsePrompt("Find me cloud kitchens and bakeries within a 5km radius and pitch my ₹5 paper bags.", seller);
    expect(plan.categories.sort()).toEqual(["Bakery", "Cloud kitchen"]);
    expect(plan.radiusKm).toBe(5);
    expect(plan.unitPriceInr).toBe(5);
    expect(plan.product.toLowerCase()).toContain("paper bags");
  });
  it("understands Hinglish categories and falls back to high-affinity buyers", () => {
    expect(parsePrompt("3 km mein mithai ki dukaan dhundo", seller).categories).toEqual(["Sweet shop"]);
    expect(parsePrompt("kisko bechu?", seller).categories).toContain("Bakery");
  });
});

describe("scoring", () => {
  const plan = parsePrompt("Find me cloud kitchens and bakeries within a 5km radius and pitch my ₹5 paper bags.", seller);
  const ranked = rankLeads(all.filter((m) => m.category !== "Packaging").map((m) => scoreMerchant(seller, plan, m, today)));
  it("ranks Karan's Cafe in the top 3", () => {
    const top3 = ranked.filter((r) => !r.excluded).slice(0, 3).map((r) => r.merchantId);
    expect(top3).toContain(karan.id);
  });
  it("explains exclusions for out-of-radius and wrong-category merchants", () => {
    const bake = ranked.find((r) => r.merchantId === "m-bake-studio")!;
    expect(bake.excluded).toMatch(/outside your 5 km radius/);
    const hardware = ranked.find((r) => r.merchantId === "m-sharma-hardware")!;
    expect(hardware.excluded).toMatch(/doesn't buy/);
  });
  it("cites a source for every reason", () => {
    for (const r of ranked.slice(0, 5)) for (const reason of r.reasons) expect(reason.source).toBeTruthy();
  });
  it("separates relevance from timing so a timely buyer can be prioritised", () => {
    const withSignal = scoreMerchant(seller, plan, karan, today);
    const quiet = scoreMerchant(seller, plan, all.find((m) => m.name === "Mama's Oven")!, today);
    expect(withSignal.breakdown.timing).toBeGreaterThan(quiet.breakdown.timing);
    expect(withSignal.breakdown.total).toBe(withSignal.fitScore);
    expect(withSignal.breakdown.relevance).toBeLessThanOrEqual(35);
  });
  it("affinity is directional", () => {
    expect(affinity("Packaging", "Bakery")).toBeGreaterThan(affinity("Packaging", "Hardware"));
  });
});

describe("reply understanding", () => {
  it("reads a Hinglish price objection with the competitor's price", () => {
    const u = classifyReply("Bhaiya rate zyada hai, ₹3 mein milega? Abhi wale supplier se ₹3.50 mein aata hai.");
    expect(u.intent).toBe("OBJECTION");
    expect(u.objection).toBe("PRICE_TOO_HIGH");
    expect(u.secondaryObjection).toBe("HAS_SUPPLIER");
    expect(u.askedPriceInr).toBe(3);
    expect(u.competitorPriceInr).toBe(3.5);
    expect(u.language).toBe("hinglish");
  });
  it("detects a sample request and monthly restock timing", () => {
    const u = classifyReply("Theek hai, pehle sample bhejo. Kal 11 baje tak cafe pe koi hoga. Har mahine 5 tareekh ko stock lete hain.");
    expect(u.intent).toBe("WANTS_SAMPLE");
    expect(u.timing).toBe("Restocks monthly on the 5th");
  });
  it("detects credit, orders and polite refusals", () => {
    expect(classifyReply("60 din ka credit milega kya?").objection).toBe("CREDIT_TERMS");
    expect(classifyReply("500 pcs bhej do, order confirm").intent).toBe("PLACES_ORDER");
    expect(classifyReply("Nahi chahiye bhai").intent).toBe("NOT_INTERESTED");
  });
  it("keeps the quote verbatim from the message", () => {
    const raw = "Namaste. Bhaiya rate zyada hai, ₹3 mein milega?";
    expect(raw).toContain(classifyReply(raw).quote);
  });
});

describe("counter plays", () => {
  it("answers price with the bulk tier and names the competitor price", () => {
    const u = classifyReply("Bhaiya rate zyada hai, ₹3 mein milega? Abhi wale supplier se ₹3.50 mein aata hai.");
    const [play] = choosePlays(u);
    expect(play.id).toBe("bulk_tier");
    const text = play.render({ buyerFirstName: "Karan", sellerFirstName: "Rahul", offers, understanding: u });
    expect(text).toContain("₹4.20");
    expect(text).toContain("₹3.50");
  });
  it("moves stages and triggers dispatch on a sample request", () => {
    const u = classifyReply("Theek hai, pehle sample bhejo.");
    expect(stageAfterReply(u, "OBJECTION")).toBe("SAMPLE_REQUESTED");
    expect(choosePlays(u)[0].next).toBe("SAMPLE_DISPATCH");
  });
});

describe("pitch", () => {
  it("writes a short, specific Hinglish pitch that passes validation", () => {
    const pitch = templatePitch({
      seller: { name: "EcoPack Solutions", firstName: "Rahul", area: "Chakala, Andheri East", product: "Paper bags", unitPriceInr: 5, offers },
      merchant: karan, distanceKm: 2.1, language: "hinglish", today,
    });
    expect(pitch.text).toContain("Karan ji");
    expect(pitch.text).toContain("2.1 km");
    expect(pitch.text).toContain("₹5");
    expect(validatePitch(pitch.text)).toEqual([]);
    expect(pitch.why.map((w) => w.tag)).toEqual(["PAYTM", "WEB", "SIGNAL", "OFFER"]);
  });
  it("flags pushy or overlong drafts", () => {
    expect(validatePitch("Act now! Guaranteed best in india")).not.toEqual([]);
  });
});

describe("growth loop", () => {
  it("revives a price objection when a cheaper tier launched afterwards", () => {
    const [r] = findRevivals([{ dealId: "d1", merchantId: "m1", merchantName: "Sharma Sweets", category: "PRICE_TOO_HIGH", quote: "₹5 bahut hai", saidAt: new Date("2026-09-12T12:00:00+05:30"), signals: [], valueInr: 9000 }], offers, today);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.changes[0]).toContain("₹4.2");
  });
  it("does not revive when nothing changed", () => {
    expect(findRevivals([{ dealId: "d2", merchantId: "m2", merchantName: "X", category: "QUALITY_DOUBT", quote: null, saidAt: new Date("2026-10-02T12:00:00+05:30"), signals: [], valueInr: 1000 }], offers, today)).toEqual([]);
  });
  it("aggregates objections and ignores refusals", () => {
    const agg = aggregateObjections([{ category: "PRICE_TOO_HIGH", quote: "a" }, { category: "PRICE_TOO_HIGH", quote: "b" }, { category: "NOT_INTERESTED", quote: null }, { category: "CREDIT_TERMS", quote: null }]);
    expect(agg.map((a) => [a.category, a.count])).toEqual([["PRICE_TOO_HIGH", 2], ["CREDIT_TERMS", 1]]);
  });
});
