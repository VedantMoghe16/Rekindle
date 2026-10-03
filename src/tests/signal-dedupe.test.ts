import { describe, expect, it } from "vitest";
import { computeSignals, computedDedupeKey } from "@/lib/engines/computed-signals";
import { SignalType } from "@/lib/schemas";

/** Signals are upserted by dedupeKey: the same evidence must always produce the same key, and invalid types are rejected before storage. */
describe("signal dedupe keys", () => {
  const today = new Date("2026-10-04T06:30:00Z");
  const input = { dealId: "deal-x", accountId: "acc-x", timing: { text: "after Q2", resolved_date: "2026-10-01" }, competitor: { name: "SecureGrid", contract_end_date: "2026-12-15" }, missingFeature: { description: "ISO", feature_key: "iso27001_mapping" } };
  const changelog = [{ date: "2026-09-22", title: "ISO 27001 Annex A control mapping", featureKey: "iso27001_mapping" }];

  it("is stable across runs", () => {
    const first = computeSignals(input, changelog, today).map((s) => s.dedupeKey);
    const second = computeSignals(input, changelog, new Date(today.getTime() + 86_400_000)).map((s) => s.dedupeKey);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });

  it("is deal- and type-scoped", () => {
    expect(computedDedupeKey("deal-x", "DATE_REACHED")).toBe("computed:deal-x:date_reached");
    expect(computedDedupeKey("deal-y", "DATE_REACHED")).not.toBe(computedDedupeKey("deal-x", "DATE_REACHED"));
  });

  it("rejects unknown signal types before upsert", () => {
    expect(SignalType.safeParse("HIRING_RELEVANT").success).toBe(true);
    expect(SignalType.safeParse("RANDOM_NEWS").success).toBe(false);
  });
});
