import { describe, expect, it } from "vitest";
import { assignLane, freshness, scoreMatch, valueScore } from "@/lib/engines/match";

const today = new Date("2026-10-04T06:30:00Z");

describe("matcher", () => {
  it("matches funding to a budget objection", () => {
    const result = scoreMatch("BUDGET", [{ id: "s", type: "FUNDING", title: "Raised", occurredAt: new Date("2026-09-24"), provenance: "demo" }], new Date("2026-03-14"), today);
    expect(result.matchScore).toBe(95);
    expect(assignLane(result.matchScore, result.effect)).toBe("REVIVE");
  });
  it("applies boundaries and excludes pre-evidence signals", () => {
    expect(freshness(new Date("2026-09-20"), today)).toBe(1);
    expect(freshness(new Date("2026-07-01"), today)).toBe(0.5);
    expect(scoreMatch("BUDGET", [{ id: "s", type: "FUNDING", title: "Old", occurredAt: new Date("2026-01-01"), provenance: "demo" }], new Date("2026-03-14"), today).matchScore).toBe(0);
  });
  it("scores value percentile with stable ties", () => {
    expect(valueScore(22, [22, 15, 18])).toBe(100);
    expect(valueScore(15, [22, 15, 15])).toBe(0);
  });
});
