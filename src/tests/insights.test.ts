import { describe, expect, it } from "vitest";
import { aggregateObjections, anonymiseQuote, type ObjectionRow } from "@/lib/engines/insights";

const row = (over: Partial<ObjectionRow>): ObjectionRow => ({ dealId: "d", accountId: "a", accountName: "Acme", valueInr: 1_000_000, lane: "WATCH", stallCategory: "BUDGET", quote: "No budget.", speaker: "S", title: "CTO", date: "2026-06-01T00:00:00Z", ...over });

describe("aggregateObjections", () => {
  const rows: ObjectionRow[] = [
    row({ dealId: "1", accountId: "a1", accountName: "Tripnest", stallCategory: "IMPLEMENTATION_EFFORT", valueInr: 1_600_000, quote: "Onboarding took 4 months." }),
    row({ dealId: "2", accountId: "a2", accountName: "Zestcart", stallCategory: "IMPLEMENTATION_EFFORT", valueInr: 1_100_000, lane: "WARM" }),
    row({ dealId: "3", accountId: "a3", accountName: "Finvara", stallCategory: "BUDGET", valueInr: 2_200_000, lane: "REVIVE" }),
    row({ dealId: "4", accountId: "a4", accountName: "Paywise", stallCategory: "BUDGET", valueInr: 1_400_000 }),
    row({ dealId: "5", accountId: "a5", accountName: "Nimbus", stallCategory: "WENT_DARK", valueInr: 600_000 }),
  ];
  const groups = aggregateObjections(rows);

  it("sorts by count, then value, with share of all stalled deals", () => {
    expect(groups.map((g) => g.category)).toEqual(["BUDGET", "IMPLEMENTATION_EFFORT", "WENT_DARK"]);
    expect(groups[0]).toMatchObject({ count: 2, valueInr: 3_600_000, share: 0.4, label: "Budget" });
    expect(groups[1].label).toBe("Implementation effort");
  });

  it("collects quotes by deal value, account ids and lane counts", () => {
    const impl = groups[1];
    expect(impl.quotes[0]).toMatchObject({ quote: "Onboarding took 4 months.", company: "Tripnest", title: "CTO", accountId: "a1" });
    expect(impl.accountIds).toEqual(["a1", "a2"]);
    expect(impl.lanes).toEqual({ WATCH: 1, WARM: 1 });
  });

  it("caps quotes at five", () => {
    const many = Array.from({ length: 8 }, (_, i) => row({ dealId: `d${i}`, accountId: `a${i}`, valueInr: i }));
    expect(aggregateObjections(many)[0].quotes).toHaveLength(5);
    expect(aggregateObjections([])).toEqual([]);
  });
});

describe("anonymiseQuote", () => {
  it("removes company names and person names", () => {
    expect(anonymiseQuote("Rakesh, who was driving this at Bharat Freight, has moved on.", ["Bharat Freight"], ["Rakesh Gupta"])).toBe("[name], who was driving this at [name], has moved on.");
    expect(anonymiseQuote("Our cloud bill is high", ["Kirana Cloud"])).toBe("Our cloud bill is high");
  });
});
