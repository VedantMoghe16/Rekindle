import { describe, expect, it } from "vitest";
import { detectCold } from "@/lib/engines/cold";

const today = new Date("2026-10-04T06:30:00Z");
const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000);
const base = { stage: "stalled", lane: "WARM", valueInr: 1_000_000, outcomes: [] as { event: string; occurredAt: Date; isSeeded: boolean }[] };

describe("detectCold", () => {
  it("flags open deals silent for more than 14 days, highest value first", () => {
    const result = detectCold([
      { ...base, id: "a", lastTouchAt: daysAgo(20), valueInr: 500_000 },
      { ...base, id: "b", lastTouchAt: daysAgo(40), valueInr: 900_000 },
      { ...base, id: "c", lastTouchAt: daysAgo(3) },
    ], today);
    expect(result.map((r) => r.dealId)).toEqual(["b", "a"]);
    expect(result[0].daysSilent).toBe(40);
    expect(result[0].nudge).toContain("40 days");
  });

  it("ignores REVIVE lane, closed stages and deals without a last touch", () => {
    expect(detectCold([
      { ...base, id: "r", lane: "REVIVE", lastTouchAt: daysAgo(60) },
      { ...base, id: "w", stage: "won", lastTouchAt: daysAgo(60) },
      { ...base, id: "n", lastTouchAt: null },
    ], today)).toEqual([]);
  });

  it("skips deals with a real reply or meeting after the last touch but ignores seeded outcomes", () => {
    const result = detectCold([
      { ...base, id: "replied", lastTouchAt: daysAgo(30), outcomes: [{ event: "replied", occurredAt: daysAgo(10), isSeeded: false }] },
      { ...base, id: "seeded", lastTouchAt: daysAgo(30), outcomes: [{ event: "meeting", occurredAt: daysAgo(10), isSeeded: true }] },
      { ...base, id: "old-reply", lastTouchAt: daysAgo(30), outcomes: [{ event: "replied", occurredAt: daysAgo(40), isSeeded: false }] },
    ], today);
    expect(result.map((r) => r.dealId).sort()).toEqual(["old-reply", "seeded"]);
  });

  it("respects a custom threshold", () => {
    expect(detectCold([{ ...base, id: "x", lastTouchAt: daysAgo(8) }], today, 7)).toHaveLength(1);
  });
});

describe("dormant cut-off", () => {
  it("skips stalled deals that went quiet long ago but keeps active ones", async () => {
    const { detectCold } = await import("@/lib/engines/cold");
    const today = new Date("2026-10-04T06:30:00Z");
    const old = new Date("2026-03-01T06:30:00Z");
    const recent = new Date("2026-08-01T06:30:00Z");
    const result = detectCold([
      { id: "stalled-old", stage: "stalled", lane: "WATCH", lastTouchAt: old, valueInr: 1 },
      { id: "stalled-recent", stage: "stalled", lane: "WATCH", lastTouchAt: recent, valueInr: 1 },
      { id: "active-old", stage: "active", lane: "WATCH", lastTouchAt: old, valueInr: 1 },
    ], today);
    expect(result.map((deal) => deal.dealId).sort()).toEqual(["active-old", "stalled-recent"]);
  });
});
