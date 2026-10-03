import { describe, expect, it } from "vitest";
import { candidateMatches, compileDiscoveryPrompt, DEFAULT_CRITERIA } from "@/lib/engines/discovery";

const candidate = { city: "Bengaluru", industry: "SaaS", sizeBand: "51–200", fundingStage: "Series A", tagsJson: JSON.stringify(["saas", "security-hiring"]) };

describe("discovery compiler", () => {
  it("refines cities without dropping the rest of the ICP", () => {
    const criteria = compileDiscoveryPrompt("Only Bengaluru and Mumbai, please", DEFAULT_CRITERIA);
    expect(criteria.cities).toEqual(["Bengaluru", "Mumbai"]);
    expect(criteria.industries).toEqual(DEFAULT_CRITERIA.industries);
  });
  it("supports explicit industry exclusion", () => {
    expect(compileDiscoveryPrompt("Exclude fintech", DEFAULT_CRITERIA).industries).not.toContain("Fintech");
  });
  it("filters using explicit criteria and known evidence", () => {
    expect(candidateMatches(candidate, DEFAULT_CRITERIA)).toBe(true);
    expect(candidateMatches(candidate, { ...DEFAULT_CRITERIA, cities: ["Mumbai"] })).toBe(false);
  });
});
