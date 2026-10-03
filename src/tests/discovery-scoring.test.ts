import { describe, expect, it } from "vitest";
import { companyMatches, compileDiscoveryPrompt, computeTiming, confidenceFor, DEFAULT_CRITERIA, heuristicFit, overallScore, parseSizeBand, roleKeywordsFor } from "@/lib/engines/discovery";

const today = new Date("2026-10-04T12:00:00+05:30");
const days = (n: number) => new Date(today.getTime() - n * 86_400_000);
const base = { name: "Acme", domain: "acme.in", industry: "SaaS", city: "Bengaluru", sizeBand: "201–500", fundingStage: "Series B", tags: ["enterprise-sales", "soc2", "devops"] };

describe("heuristicFit", () => {
  it("scores a perfect-fit company highly with explicit reasons", () => {
    const { fitScore, whyFit } = heuristicFit(base, DEFAULT_CRITERIA);
    expect(fitScore).toBeGreaterThanOrEqual(85);
    expect(whyFit.join(" ")).toContain("SaaS matches");
  });
  it("lowers fit for size and funding mismatches instead of excluding", () => {
    const big = heuristicFit({ ...base, sizeBand: "5000+", fundingStage: "Public" }, DEFAULT_CRITERIA);
    expect(big.fitScore).toBeLessThan(heuristicFit(base, DEFAULT_CRITERIA).fitScore - 25);
    expect(big.whyFit.some((reason) => reason.startsWith("Larger than target"))).toBe(true);
    expect(companyMatches({ ...base, sizeBand: "5000+" }, DEFAULT_CRITERIA)).toBe(true);
  });
  it("says Unknown funding rather than guessing", () => {
    expect(heuristicFit({ ...base, fundingStage: null }, DEFAULT_CRITERIA).whyFit).toContain("Funding stage unknown");
  });
  it("penalises likely competitors", () => {
    expect(heuristicFit({ ...base, tags: ["compliance-vendor", "soc2"] }, DEFAULT_CRITERIA).whyFit.join(" ")).toContain("competitor");
  });
  it("filters by industry case-insensitively, city and exclusions", () => {
    expect(companyMatches({ ...base, industry: "saas" }, DEFAULT_CRITERIA)).toBe(true);
    expect(companyMatches({ ...base, industry: "Logistics" }, DEFAULT_CRITERIA)).toBe(false);
    expect(companyMatches(base, { ...DEFAULT_CRITERIA, cities: ["Mumbai"] })).toBe(false);
    expect(companyMatches(base, { ...DEFAULT_CRITERIA, exclusions: ["devops"] })).toBe(false);
  });
  it("parses size bands", () => {
    expect(parseSizeBand("51–200")).toEqual([51, 200]);
    expect(parseSizeBand("5000+")).toEqual([5000, Number.POSITIVE_INFINITY]);
  });
});

describe("computeTiming", () => {
  it("uses the strongest fresh signal", () => {
    expect(computeTiming([{ type: "FUNDING", occurredAt: days(3) }, { type: "PRODUCT_LAUNCH", occurredAt: days(1) }], today)).toBe(70);
    expect(computeTiming([{ type: "LEADERSHIP_CHANGE", occurredAt: days(30) }], today)).toBe(68);
  });
  it("adds 5 per extra relevant role, capped at 85", () => {
    expect(computeTiming([{ type: "HIRING_RELEVANT", occurredAt: days(2), roleCount: 3 }], today)).toBe(70);
    expect(computeTiming([{ type: "HIRING_RELEVANT", occurredAt: days(2), roleCount: 20 }], today)).toBe(85);
  });
  it("treats future-dated evidence as fresh", () => {
    expect(computeTiming([{ type: "FUNDING", occurredAt: new Date(today.getTime() + 2 * 86_400_000) }], today)).toBe(70);
  });
  it("returns the no-evidence floor for none or expired signals", () => {
    expect(computeTiming([], today)).toBe(15);
    expect(computeTiming([{ type: "FUNDING", occurredAt: days(400) }], today)).toBe(15);
  });
  it("discounts cache-fallback (stale) evidence", () => {
    expect(computeTiming([{ type: "FUNDING", occurredAt: days(3) }], today, { stale: true })).toBe(63);
  });
});

describe("overall and confidence", () => {
  it("blends 60% fit and 40% timing", () => {
    expect(overallScore(80, 70)).toBe(76);
    expect(overallScore(55, 15)).toBe(39);
  });
  it("grades confidence by evidence count and staleness", () => {
    expect(confidenceFor(3, false)).toBe("HIGH");
    expect(confidenceFor(3, true)).toBe("MEDIUM");
    expect(confidenceFor(1, false)).toBe("MEDIUM");
    expect(confidenceFor(0, false)).toBe("LOW");
  });
});

describe("rules compiler", () => {
  it("compiles the sample prompt", () => {
    const criteria = compileDiscoveryPrompt("We automate SOC 2 and ISO 27001 for Indian SaaS companies. Find Series A–C companies with 50–500 employees that sell to enterprises and are hiring security, platform or compliance roles. Target CTOs and Heads of Security.", DEFAULT_CRITERIA);
    expect(criteria.fundingStages).toEqual(["Series A", "Series B", "Series C"]);
    expect([criteria.employeeMin, criteria.employeeMax]).toEqual([50, 500]);
    expect(criteria.personas).toEqual(["CTO", "Head of Security"]);
    expect(criteria.signals).toEqual(expect.arrayContaining(["security hiring", "platform hiring", "compliance hiring"]));
    expect(roleKeywordsFor(criteria)).toEqual(expect.arrayContaining(["security", "platform", "compliance"]));
  });
});
