import { afterEach, describe, expect, it } from "vitest";
import { now, todayIso } from "@/lib/clock";

afterEach(() => { delete process.env.DEMO_TODAY; });

describe("demo clock", () => {
  it("freezes the business date in India", () => {
    process.env.DEMO_TODAY = "2026-10-04";
    expect(now().toISOString()).toBe("2026-10-04T06:30:00.000Z");
    expect(todayIso()).toBe("2026-10-04");
  });
});
