import { describe, expect, it } from "vitest";
import { templateDraft, validateDraft, wordCount } from "@/lib/engines/draft-rules";

describe("validateDraft", () => {
  it("enforces word limits per channel", () => {
    const sixty = Array.from({ length: 80 }, () => "word").join(" ");
    expect(validateDraft(sixty, "whatsapp").some((v) => v.includes("70 words"))).toBe(true);
    expect(validateDraft(sixty, "email")).toEqual([]);
  });

  it("bans surveillance language", () => {
    for (const phrase of ["We detected a change", "our system flagged", "we noticed you raised", "I was monitoring your news", "we tracked it", "scraped"]) {
      expect(validateDraft(phrase, "whatsapp").length).toBeGreaterThan(0);
    }
    expect(validateDraft("Congrats on the Series B!", "whatsapp")).toEqual([]);
  });

  it("allows at most one question mark", () => {
    expect(validateDraft("Free this week? Or next?", "whatsapp")).toHaveLength(1);
    expect(validateDraft("Free this week?", "whatsapp")).toEqual([]);
  });
});

describe("templateDraft", () => {
  const input = {
    contactFirstName: "Rohan Kapoor", repName: "Ananya Rao",
    quote: "But abhi budget nahi hai. We're closing our Series B, tab tak new tooling spend pe freeze hai.",
    quoteDate: new Date("2026-03-14T06:30:00Z"), signalTitle: "Finvara Pay raises ₹180 Cr Series B", proofPoint: "Median onboarding time is 14 days",
  };

  it("produces a valid WhatsApp draft referencing their words and month", () => {
    const draft = templateDraft({ ...input, channel: "whatsapp" });
    expect(validateDraft(draft.body, "whatsapp")).toEqual([]);
    expect(draft.subject).toBeNull();
    expect(draft.body).toContain("March");
    expect(draft.body).toContain("abhi budget");
    expect(draft.body).toContain("Rohan");
    expect(draft.body).toContain("Ananya");
  });

  it("produces a valid email with a subject", () => {
    const draft = templateDraft({ ...input, channel: "email" });
    expect(validateDraft(draft.body, "email")).toEqual([]);
    expect(draft.subject).toContain("March");
    expect(draft.why_this_works.length).toBeGreaterThan(0);
  });

  it("stays valid with long inputs, banned words and question marks in sources", () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}?`).join(" ");
    const draft = templateDraft({ ...input, channel: "whatsapp", quote: long, signalTitle: "Detected new hiring", proofPoint: long, language: "hinglish" });
    expect(validateDraft(draft.body, "whatsapp")).toEqual([]);
    expect(wordCount(draft.body)).toBeLessThanOrEqual(70);
  });

  it("works without a signal or quote (cold nudge)", () => {
    const draft = templateDraft({ ...input, channel: "email", quote: null, signalTitle: null, proofPoint: null, quoteDate: null });
    expect(validateDraft(draft.body, "email")).toEqual([]);
  });
});
