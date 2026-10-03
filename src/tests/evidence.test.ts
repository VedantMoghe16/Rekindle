import { describe, expect, it } from "vitest";
import { verifyEvidence } from "@/lib/engines/evidence";

const chat = `[2026-03-14 11:20] Rohan Kapoor: Thanks Ananya. Honestly product is solid, team ko demo kaafi pasand aaya.
[2026-03-14 11:21] Rohan Kapoor: But abhi budget nahi hai. We’re closing our Series B, tab tak new tooling spend pe freeze hai.
[2026-03-14 11:23] Rohan Kapoor: Ping me once the round closes.`;

describe("verifyEvidence", () => {
  it("matches exactly ignoring case, whitespace and curly quotes, returning the source substring", () => {
    const result = verifyEvidence("but ABHI budget   nahi hai. We're closing our Series B", chat);
    expect(result.verified).toBe(true);
    expect(result.score).toBe(1);
    expect(result.quote).toBe("But abhi budget nahi hai. We’re closing our Series B");
  });

  it("strips wrapping quote marks", () => {
    expect(verifyEvidence("“Ping me once the round closes.”", chat).quote).toBe("Ping me once the round closes.");
  });

  it("fuzzy-matches a lightly paraphrased quote to the exact source sentence", () => {
    const result = verifyEvidence("abhi budget nahi hai, closing Series B so tooling spend pe freeze", chat);
    expect(result.verified).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.6);
    expect(chat).toContain(result.quote);
    expect(result.quote).not.toContain("Rohan Kapoor:");
  });

  it("rejects invented quotes", () => {
    const result = verifyEvidence("We already bought a competitor product last month", chat);
    expect(result.verified).toBe(false);
    expect(result.score).toBeLessThan(0.6);
  });

  it("handles empty input", () => {
    expect(verifyEvidence("", chat).verified).toBe(false);
    expect(verifyEvidence("hello", "").verified).toBe(false);
  });
});
