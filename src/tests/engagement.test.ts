import { describe, expect, it } from "vitest";
import { buildEngagementSignal, countEngagementsByAccount, DEFAULT_ENGAGEMENT_PLAN, mergeLaneChanges, planForTargets } from "@/lib/services/engagement";
import { assignLane, campaignScore } from "@/lib/engines/match";

describe("engagement aggregation", () => {
  it("counts events per account", () => {
    const counts = countEngagementsByAccount([{ accountId: "a" }, { accountId: "b" }, { accountId: "a" }, { accountId: "a" }]);
    expect([...counts.entries()]).toEqual([["a", 3], ["b", 1]]);
  });

  it("builds one deduped signal per account and campaign with the cumulative count", () => {
    const signal = buildEngagementSignal({ campaignId: "c1", accountId: "account-tripnest", events: 3, campaignCategory: "IMPLEMENTATION_EFFORT", coreMessage: "Live in 14 days, not 4 months.", simulated: true });
    expect(signal.dedupeKey).toBe("campaign:c1:account-tripnest");
    expect(signal.title).toBe("3 engagements with “Live in 14 days, not 4 months”");
    expect(signal.provenance).toBe("simulated");
    expect(JSON.parse(signal.rawJson)).toEqual({ events: 3, campaignCategory: "IMPLEMENTATION_EFFORT", coreMessage: "Live in 14 days, not 4 months." });
    expect(buildEngagementSignal({ campaignId: "c1", accountId: "a", events: 1, campaignCategory: "BUDGET", coreMessage: "M", simulated: false })).toMatchObject({ title: "1 engagement with “M”", provenance: "live" });
  });

  it("default plan moves Tripnest and Zestcart to Revive, Edunova stays Warm", () => {
    const counts = countEngagementsByAccount(DEFAULT_ENGAGEMENT_PLAN);
    expect(Object.fromEntries(counts)).toEqual({ "account-tripnest": 3, "account-zestcart": 3, "account-edunova": 1 });
    const lane = (events: number) => { const score = campaignScore(events, true); return assignLane(score, score >= 80 ? "REMOVES" : score >= 50 ? "WEAKENS" : "NEUTRAL", true); };
    expect(lane(3)).toBe("REVIVE");
    expect(lane(1)).toBe("WARM");
  });

  it("only applies plan steps to campaign targets", () => {
    expect(planForTargets(DEFAULT_ENGAGEMENT_PLAN, ["account-edunova"]).map((s) => s.accountId)).toEqual(["account-edunova"]);
    expect(planForTargets(DEFAULT_ENGAGEMENT_PLAN, [])).toEqual([]);
  });

  it("merges launch and engagement lane changes per deal", () => {
    const base = { accountId: "a", accountName: "Tripnest", reason: "r" };
    const merged = mergeLaneChanges([
      { ...base, dealId: "d1", fromLane: "WATCH", toLane: "WARM" },
      { ...base, dealId: "d2", fromLane: "WATCH", toLane: "WARM" },
      { ...base, dealId: "d1", fromLane: "WARM", toLane: "REVIVE" },
      { ...base, dealId: "d3", fromLane: "WARM", toLane: "WATCH" },
      { ...base, dealId: "d3", fromLane: "WATCH", toLane: "WARM" },
    ]);
    expect(merged.map((c) => `${c.dealId}:${c.fromLane}>${c.toLane}`)).toEqual(["d1:WATCH>REVIVE", "d2:WATCH>WARM"]);
  });
});
