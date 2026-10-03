import { describe, expect, it } from "vitest";
import { formatINR } from "@/lib/format";

describe("formatINR", () => {
  it("uses Indian pipeline units", () => {
    expect(formatINR(1_800_000)).toBe("₹18 L");
    expect(formatINR(24_000_000)).toBe("₹2.4 Cr");
    expect(formatINR(85_000)).toBe("₹85,000");
  });
});
