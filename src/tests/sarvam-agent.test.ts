import { describe, expect, it } from "vitest";
import { initialBotMessage, normalizePhone, parseFinalVariables, sarvamConfig, SarvamConfigError, webhookUrlFor } from "@/lib/providers/sarvam-agent";

const vars = { owner_name: "Karan", merchant_name: "Karan's Cafe & Bakery", seller_name: "Rahul", seller_business: "EcoPack Solutions", rating_hook: "", distance_km: "2.1", product: "Pastry box", price: "₹9 each", offer: "Free sample", past_objections: "", counter_offer: "" };

describe("Sarvam Vyapar SDR contract (shared with the vyapar-integration branch)", () => {
  it("normalises outcome and objection synonyms leniently", () => {
    expect(parseFinalVariables({ outcome: "Sample Request", objection_type: "Pricing", objection_quote: " too costly ", callback_time: "null" })).toMatchObject({ outcome: "sample_requested", objection_type: "price", objection_quote: "too costly" });
    expect(parseFinalVariables({ outcome: "call back" }).outcome).toBe("callback");
    expect(parseFinalVariables({ outcome: "banana" }).outcome).toBeUndefined();
  });
  it("uses a different opening line for follow-up calls", () => {
    expect(initialBotMessage(vars)).toContain("2.1 km door");
    expect(initialBotMessage({ ...vars, past_objections: "price" })).toContain("Pichli baar");
  });
  it("lists every missing setting instead of dialling", () => {
    expect(() => sarvamConfig({})).toThrow(SarvamConfigError);
    try { sarvamConfig({ SARVAM_API_KEY: "k" }); } catch (e) { expect((e as SarvamConfigError).missing).toContain("SARVAM_APP_ID"); }
  });
  it("normalises Indian numbers to E.164 and signs the webhook URL", () => {
    expect(normalizePhone("98200 12345")).toBe("+919820012345");
    expect(webhookUrlFor({ publicBaseUrl: "https://x.example", webhookSecret: "a b" })).toBe("https://x.example/api/vyapar/webhooks/sarvam?secret=a%20b");
  });
});

describe("call transcript as spoken", () => {
  it("keeps Analytics content in the spoken language and the English version when given", async () => {
    const { parseTranscript } = await import("@/lib/providers/sarvam-agent");
    const turns = parseTranscript({ messages: [
      { role: "assistant", content: "नमस्ते Sunita जी", language_name: "Hindi" },
      { role: "user", content: "पर मैं आपसे ही क्यों लूँ?", language_name: "UNKNOWN" },
    ] });
    expect(turns).toEqual([
      { role: "agent", en_text: "नमस्ते Sunita जी", text: "नमस्ते Sunita जी", language: "Hindi" },
      { role: "user", en_text: "पर मैं आपसे ही क्यों लूँ?", text: "पर मैं आपसे ही क्यों लूँ?" },
    ]);
    expect(parseTranscript([{ role: "user", en_text: "Too costly" }])[0]).toMatchObject({ en_text: "Too costly" });
  });
});
