import { describe, expect, it } from "vitest";
import { bestSnippet, categoriesForText, isTemporalQuestion, lexicalScore, rankDocuments, tokenize, type KnowledgeDoc } from "@/lib/services/knowledge";

describe("knowledge lexical helpers", () => {
  it("tokenizes without stopwords", () => {
    expect(tokenize("Which deals are blocked on implementation effort?")).toEqual(["blocked", "implementation", "effort"]);
  });

  it("scores overlap with prefix matching", () => {
    expect(lexicalScore("implementation effort", "onboarding effort was high, implementing took months")).toBeGreaterThan(0.8);
    expect(lexicalScore("budget", "nothing relevant here")).toBe(0);
  });

  it("maps questions to stall categories", () => {
    expect(categoriesForText("Which deals are blocked on implementation effort and what did they say?")[0]).toBe("IMPLEMENTATION_EFFORT");
    expect(categoriesForText("Which deals are stuck on budget?")).toContain("BUDGET");
    expect(categoriesForText("Who is locked into a competitor contract?")[0]).toBe("COMPETITOR_LOCKIN");
    expect(categoriesForText("Onboarding took 4 months")).toContain("IMPLEMENTATION_EFFORT");
    expect(categoriesForText("What has this account told us and promised?")).toEqual([]);
  });

  it("detects temporal questions", () => {
    expect(isTemporalQuestion("What changed since March?")).toBe(true);
    expect(isTemporalQuestion("Who is the champion?")).toBe(false);
  });

  it("ranks documents and picks the best snippet line", () => {
    const doc = (id: string, text: string): KnowledgeDoc => ({ id, kind: "interaction", accountId: "a", accountName: "A", dealId: "d", title: id, date: new Date(), text });
    const ranked = rankDocuments("onboarding engineers", [doc("x", "pricing talk"), doc("y", "# header\nhello\nonboarding pulled 2 engineers off")]);
    expect(ranked.map((r) => r.doc.id)).toEqual(["y"]);
    expect(bestSnippet("onboarding engineers", ranked[0].doc.text)).toBe("onboarding pulled 2 engineers off");
  });
});
