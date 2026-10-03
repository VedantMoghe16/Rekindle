import { describe, expect, it } from "vitest";
import merchants from "../../data/merchants.json";
import osm from "../../data/andheri-osm.json";
import { parsePrompt } from "@/lib/vyapar/planner";
import { evaluateOpportunity, NO_PREFS, preferenceImpact, rankOpportunities, timingFor, unsupportedClaims, type OppContext, type OppMerchant, type OppSeller } from "@/lib/vyapar/opportunity";
import { buildPrefs, preferenceFromSkip, type PreferenceRow } from "@/lib/vyapar/preferences";
import { groundedPitch } from "@/lib/vyapar/grounded";
import type { SellerOffers } from "@/lib/vyapar/taxonomy";

const today = new Date("2026-10-04T12:00:00+05:30");
const offers: SellerOffers = {
  catalog: [
    { sku: "PX-6", name: "Pastry box 6 inch", unitPriceInr: 9, inStock: true, servesCategories: ["Bakery", "Sweet shop", "Cafe"] },
    { sku: "FB-500", name: "Biodegradable food box 500 ml", unitPriceInr: 7, inStock: true, servesCategories: ["Cloud kitchen", "Restaurant", "Fast food", "Cafe"] },
    { sku: "PB-S", name: "Paper carry bag (small)", unitPriceInr: 5, inStock: true, servesCategories: ["Bakery", "Sweet shop", "Cafe", "Restaurant", "Fast food", "Cloud kitchen", "Grocery"] },
  ],
  tiers: [{ minQty: 1000, unitPriceInr: 4.2, label: "Bulk tier", launchedOn: "2026-10-01" }],
  freeSample: { enabled: true, perWeek: 20, contents: "25 bags + 10 pastry boxes" },
  credit: { days: 15, viaPaytmPostpaid: true },
  deliveryRadiusKm: 8, sameDayCutoff: "2 PM", moq: 200, maxMonthlyUnitsPerBuyer: null,
  proofPoints: ["Grease-proof"],
};
const seller: OppSeller = { productCategory: "Packaging", lat: 19.115, lng: 72.856, offers };
const plan = parsePrompt("Find me cloud kitchens and bakeries within a 5km radius and pitch my ₹5 paper bags.", { productCategory: "Packaging", product: "Paper bags", unitPriceInr: 5 });
const ctx = (over: Partial<OppContext> = {}): OppContext => ({ activeDeals: new Map(), optOuts: new Map(), buyerStated: new Map(), ...over });

const demo: OppMerchant[] = merchants.filter((m) => m.category !== "Packaging").map((m) => ({
  ...m, brand: null, street: null, cuisine: null, openingHours: null, osmId: null, contactRole: m.contactRole ?? null, observedAt: m.observedAt ?? null,
}));
const pub: OppMerchant[] = osm.places.map((p) => ({
  id: `osm-${p.osmId}`, name: p.name, ownerName: "", category: p.category, area: p.suburb ?? "Andheri", lat: p.lat, lng: p.lng, source: "osm",
  qrVolumeBand: "Unknown", rating: null, reviewCount: null, mcc: "", profile: { sources: [], instagram: null, highlights: [], currentPackaging: null },
  signals: [], brand: p.brand, contactStatus: "unknown", contactRole: null, street: p.street, cuisine: p.cuisine, openingHours: p.openingHours, observedAt: osm.observedAt, osmId: p.osmId,
}));
const karan = demo.find((m) => m.name === "Karan's Cafe & Bakery")!;
const all = [...demo, ...pub];
const evaluate = (prefs = NO_PREFS, c = ctx()) => rankOpportunities(all.map((m) => evaluateOpportunity(seller, plan, m, prefs, c, today)));

describe("opportunity engine", () => {
  it("puts Karan's Cafe in the top three eligible opportunities, ahead of public listings", () => {
    const top = evaluate().filter((o) => o.eligibility === "eligible").slice(0, 3);
    expect(top.map((o) => o.merchantId)).toContain(karan.id);
    const k = top.find((o) => o.merchantId === karan.id)!;
    expect(k.timing.status).toBe("fresh");
    expect(k.hypothesis).toBe("Pastry box sample for the new outlet");
    expect(k.action).toBe("pitch");
    expect(k.confidence.reasons).toContain("Demo data: fictional merchant fixture");
  });

  it("only shows eligible, deliverable opportunities in the shortlist", () => {
    for (const o of evaluate().filter((x) => x.eligibility === "eligible")) {
      expect(o.gates.every((g) => g.status !== "FAIL")).toBe(true);
      expect(o.distanceKm).toBeLessThanOrEqual(5);
    }
  });

  it("says 'Timing unknown' for public listings and never invents a contact", () => {
    const o = evaluate().find((x) => x.provenance === "public" && x.eligibility === "eligible")!;
    expect(o.timing.label).toBe("Timing unknown");
    expect(o.contact.status).toBe("unknown");
    expect(o.action).toBe("visit");
    expect(o.angle).toBe("INTRO");
    expect(o.unknowns).toContain("Who decides purchases and how to reach them");
    expect(o.whyMerchant[0].source).toBe("OpenStreetMap");
  });

  it("ignores stale and future-dated signals for 'why now'", () => {
    const t = timingFor([{ type: "NEW_OUTLET", title: "Old", date: "2026-06-01", source: "x" }, { type: "NEW_OUTLET", title: "Soon", date: "2026-12-01", source: "x" }], today, "demo");
    expect(t.status).not.toBe("fresh");
    expect(t.ignored.join(" ")).toMatch(/older than 45 days/);
    expect(t.ignored.join(" ")).toMatch(/future/);
  });

  it("excludes chains, out-of-range merchants and opted-out buyers with specific reasons", () => {
    const chain = evaluateOpportunity(seller, plan, { ...karan, id: "x", brand: "Theobroma" }, NO_PREFS, ctx(), today);
    expect(chain.eligibility).toBe("excluded");
    expect(chain.excludedReason).toMatch(/buys packaging centrally/);
    const far = evaluate().find((o) => o.merchantId === "m-bake-studio")!;
    expect(far.excludedReason).toMatch(/outside your 5 km search/);
    const opted = evaluateOpportunity(seller, plan, karan, NO_PREFS, ctx({ optOuts: new Map([[karan.id, "Said not interested on 2 Oct"]]) }), today);
    expect(opted.excludedReason).toBe("Said not interested on 2 Oct");
  });

  it("holds bulk buyers until the seller confirms capacity, then gates on the answer", () => {
    const bulk = evaluate().find((o) => o.merchantId === "m-biryani-box-cloud-kitchen")!;
    expect(bulk.eligibility).toBe("needs_check");
    const no = buildPrefs([{ id: "p1", kind: "CAPACITY_ANSWER", reason: null, merchantId: null, category: null, value: "no", label: "can't supply 1,000+/month", active: true }]);
    expect(evaluateOpportunity(seller, plan, demo.find((m) => m.id === "m-biryani-box-cloud-kitchen")!, no, ctx(), today).eligibility).toBe("excluded");
  });

  it("moves leads with an active deal out of the shortlist and links the deal", () => {
    const o = evaluateOpportunity(seller, plan, karan, NO_PREFS, ctx({ activeDeals: new Map([[karan.id, { id: "deal-1", stage: "PITCHED" }]]) }), today);
    expect(o.eligibility).toBe("in_talks");
    expect(o.action).toBe("open_deal");
    expect(o.dealId).toBe("deal-1");
  });
});

describe("seller preference feedback", () => {
  const rows: PreferenceRow[] = [];
  const skip = preferenceFromSkip("CANT_SUPPLY", { merchantId: "m-wok-express-kitchen", merchantName: "Wok Express", category: "Cloud kitchen", distanceKm: 2.4, band: "High" });
  rows.push({ ...skip, id: "pref-1", active: true });

  it("re-ranks deterministically and explains which preference moved which leads", () => {
    const after = evaluate(buildPrefs(rows));
    expect(after.filter((o) => o.eligibility === "eligible").some((o) => demo.find((m) => m.id === o.merchantId)?.category === "Cloud kitchen")).toBe(false);
    expect(preferenceImpact(after).get("pref-1")?.length).toBeGreaterThan(0);
  });

  it("undo restores the original ranking", () => {
    const before = evaluate().map((o) => o.merchantId);
    const undone = evaluate(buildPrefs(rows.map((r) => ({ ...r, active: false })))).map((o) => o.merchantId);
    expect(undone).toEqual(before);
  });

  it("too-far feedback tightens the radius below the skipped lead, but not for very near leads", () => {
    const p = preferenceFromSkip("TOO_FAR", { merchantId: "x", merchantName: "X", category: "Bakery", distanceKm: 3.4, band: null });
    expect(Number(p.value)).toBe(3.3);
    expect(preferenceFromSkip("TOO_FAR", { merchantId: "y", merchantName: "Y", category: "Bakery", distanceKm: 0.7, band: null }).kind).toBe("EXCLUDE_MERCHANT");
  });

  it("keeps merchants with an active deal visible as in talks even when a preference would exclude them", () => {
    const no = buildPrefs([{ id: "p9", kind: "CAPACITY_ANSWER", reason: null, merchantId: null, category: null, value: "no", label: "x", active: true }]);
    const biryani = demo.find((m) => m.id === "m-biryani-box-cloud-kitchen")!;
    const o = evaluateOpportunity(seller, plan, biryani, no, ctx({ activeDeals: new Map([[biryani.id, { id: "d", stage: "OBJECTION" }]]) }), today);
    expect(o.eligibility).toBe("in_talks");
    expect(preferenceImpact([o]).size).toBe(0);
  });
});

describe("grounded first message", () => {
  const sellerCtx = { name: "EcoPack Solutions", firstName: "Rahul", area: "Chakala, Andheri East", offers };
  it("acknowledges a verified public event and passes the claim check", () => {
    const opp = evaluateOpportunity(seller, plan, karan, NO_PREFS, ctx(), today);
    const p = groundedPitch({ seller: sellerCtx, merchant: karan, opp, language: "hinglish" });
    expect(p.angle).toBe("EXPANSION");
    expect(p.text).toContain("Naye outlet ke liye badhai");
    expect(p.problems).toEqual([]);
  });
  it("never leaks private payment trends into the message", () => {
    const daily = demo.find((m) => m.id === "m-daily-bread-co")!;
    const opp = evaluateOpportunity(seller, plan, daily, NO_PREFS, ctx(), today);
    expect(opp.timing.evidence?.private).toBe(true);
    const p = groundedPitch({ seller: sellerCtx, merchant: daily, opp, language: "hinglish" });
    expect(p.text).not.toMatch(/receipt|payment|QR/i);
    expect(p.why.find((w) => w.tag === "PRIVATE")?.text).toMatch(/not used in the message/);
    expect(unsupportedClaims("Aapke QR receipts badh gaye hain!", opp).length).toBeGreaterThan(0);
  });
  it("asks for an introduction when the contact is unknown", () => {
    const opp = evaluate().find((x) => x.provenance === "public" && x.eligibility === "eligible")!;
    const m = pub.find((x) => x.id === opp.merchantId)!;
    const p = groundedPitch({ seller: sellerCtx, merchant: m, opp, language: "hinglish" });
    expect(p.angle).toBe("INTRO");
    expect(p.text).toMatch(/Purchase jo dekhte hain/);
    expect(p.text).not.toMatch(/undefined/);
  });
});
