import { describe, expect, it } from "vitest";
import { parseWhatsApp } from "@/lib/parsers/whatsapp";

describe("WhatsApp parser", () => {
  it("parses Android, skips system lines, and joins multiline text", () => {
    const result = parseWhatsApp("14/03/26, 10:58 am - Messages and calls are end-to-end encrypted.\n14/03/26, 11:21 am - Rohan: First line\nsecond line");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ speaker: "Rohan", text: "First line\nsecond line" });
    expect(result.messages[0].timestamp).toBe("2026-03-14T05:51:00.000Z");
  });
  it("parses iOS and narrow no-break spaces", () => {
    const result = parseWhatsApp("[14/03/26, 11:02:45 PM] Ananya Rao: Hello");
    expect(result.messages[0].speaker).toBe("Ananya Rao");
    expect(result.messages[0].timestamp).toBe("2026-03-14T17:32:00.000Z");
  });
});
