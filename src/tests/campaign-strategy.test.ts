import { describe, expect, it } from "vitest";
import { recommendPlatform, templateCampaign, templateVariantCount, validateCampaignAssets } from "@/lib/engines/campaign-strategy";
import { StallCategory, type CampaignDraft } from "@/lib/schemas";

const seller = { name: "CloudKavach", proofPoints: ["Median onboarding time is 14 days", "One-click cloud connectors", "ISO 27001 Annex A mappings"], changelog: [{ date: "2026-09-22", title: "ISO 27001 Annex A control mapping" }] };
const quotes = [{ quote: "Last time we tried a compliance tool, onboarding took 4 months and pulled 2 engineers off the roadmap." }, { quote: "We cannot take on another quarter-long implementation." }];

describe("recommendPlatform", () => {
  it("defaults to LinkedIn for exec-heavy audiences and cites counts", () => {
    const result = recommendPlatform({ titles: ["Head of Engineering", "CTO", "Engineering Manager", "VP Tech", "Platform Lead", "CTO"], lanes: Array(6).fill("WATCH") });
    expect(result.platform).toBe("linkedin");
    expect(result.secondary).toBe("x");
    expect(result.rationale).toContain("4 of 6");
    expect(result.rationale).toContain("2 of 6");
  });
  it("picks X for builder-heavy, non-compliance audiences", () => {
    const result = recommendPlatform({ titles: ["Founder", "Platform Engineer", "DevOps Lead", "CTO"], lanes: ["WATCH", "WATCH", "WARM", "WATCH"] });
    expect(result.platform).toBe("x");
    expect(result.rationale).toContain("3 of 4");
  });
  it("keeps LinkedIn when builders are compliance-led", () => {
    expect(recommendPlatform({ titles: ["Security Engineer", "DevSecOps Engineer", "Compliance Head"], lanes: ["WATCH", "WATCH", "WATCH"] }).platform).toBe("linkedin");
  });
  it("uses email nurture when at least half of the target deals are WARM", () => {
    const result = recommendPlatform({ titles: ["CTO", "VP Engineering"], lanes: ["WARM", "WATCH"] });
    expect(result.platform).toBe("email");
    expect(result.rationale).toContain("1 of 2");
  });
});

const valid: CampaignDraft = {
  campaign_name: "Live in 14 days", core_message: "Live in 14 days, not 4 months.", rationale: "r",
  linkedin_post: "Post", x_thread: ["One", "Two"], nurture_email: { subject: "s", body: "Short body." },
  landing_hero: { headline: "Live in 14 days, not 4 months.", subhead: "s", cta: "Go" }, angle_tags: ["Speed"],
};

describe("validateCampaignAssets", () => {
  it("accepts a draft inside every limit", () => {
    expect(validateCampaignAssets(valid, ["Tripnest"])).toEqual([]);
  });
  it("flags every limit and target names", () => {
    const violations = validateCampaignAssets({
      ...valid,
      linkedin_post: "x".repeat(1201) + " Tripnest",
      x_thread: ["a".repeat(281), "b", "c", "d", "e", "f"],
      nurture_email: { subject: "s", body: Array(151).fill("word").join(" ") },
      landing_hero: { ...valid.landing_hero, headline: "one two three four five six seven eight nine ten eleven" },
    }, ["Tripnest", "Karan Malhotra"]);
    expect(violations).toHaveLength(6);
    expect(violations.join(" ")).toMatch(/LinkedIn post is 1210/);
    expect(violations.join(" ")).toMatch(/6 posts/);
    expect(violations.join(" ")).toMatch(/X post 1 is 281/);
    expect(violations.join(" ")).toMatch(/151 words/);
    expect(violations.join(" ")).toMatch(/11 words/);
    expect(violations.join(" ")).toMatch(/"Tripnest"/);
  });
});

describe("templateCampaign", () => {
  it("builds the hero Implementation-effort campaign from seller facts", () => {
    const draft = templateCampaign("IMPLEMENTATION_EFFORT", quotes, seller, { count: 6, total: 20, valueInr: 6_200_000 });
    expect(draft.core_message).toBe("Live in 14 days, not 4 months.");
    expect(draft.rationale).toContain("6 of 20");
    expect(draft.rationale).toContain("30%");
    expect(draft.rationale).toContain("₹62 L");
    expect(draft.linkedin_post).toContain("CloudKavach");
    expect(draft.linkedin_post).not.toMatch(/\{\w+\}/);
    expect(templateVariantCount("IMPLEMENTATION_EFFORT")).toBeGreaterThan(1);
    expect(templateCampaign("IMPLEMENTATION_EFFORT", quotes, seller, undefined, 1).core_message).not.toBe(draft.core_message);
  });
  it("every category and variant passes the guardrails without unfilled tokens", () => {
    for (const category of StallCategory.options) {
      for (let variant = 0; variant < templateVariantCount(category); variant++) {
        const draft = templateCampaign(category, quotes, seller, { count: 3, total: 20, valueInr: 3_000_000 }, variant);
        expect(validateCampaignAssets(draft, ["Tripnest", "Zestcart"]), `${category}#${variant}`).toEqual([]);
        expect(JSON.stringify(draft)).not.toMatch(/\{(seller|label|count|total|share|value|topQuote)\}/);
      }
    }
  });
  it("only cites seeded proof points (no invented numbers)", () => {
    for (const category of StallCategory.options) {
      const text = JSON.stringify(templateCampaign(category, [], seller, { count: 1, total: 20, valueInr: 0 }));
      expect(text).not.toMatch(/15 minutes|SOC 2|no agents|onboarding engineer/i);
    }
  });
});
