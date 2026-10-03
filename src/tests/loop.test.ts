import { describe, expect, it } from "vitest";
import { funnel, insightCallouts, learningTable, type OutcomeRow } from "@/lib/engines/loop";

function sequence(category: string, signal: string, sent: number, replied: number, meetings: number): OutcomeRow[] {
  const rows: OutcomeRow[] = [];
  for (let i = 0; i < sent; i++) {
    const base = { dealId: `d${i}`, stallCategory: category, signalType: signal, isSeeded: true, valueInr: 100 };
    rows.push({ ...base, event: "drafted" }, { ...base, event: "sent" });
    if (i < replied) rows.push({ ...base, event: "replied" });
    if (i < meetings) rows.push({ ...base, event: "meeting" });
  }
  return rows;
}

describe("revenue loop", () => {
  const rows = [...sequence("BUDGET", "FUNDING", 17, 7, 4), ...sequence("TIMING", "DATE_REACHED", 9, 2, 1)];

  it("computes reply and meeting rates per stall reason and signal", () => {
    const table = learningTable(rows);
    expect(table[0]).toMatchObject({ stallCategory: "BUDGET", signalType: "FUNDING", sent: 17, replyRate: 41, meetingRate: 24 });
    expect(table[1]).toMatchObject({ stallCategory: "TIMING", replyRate: 22 });
  });

  it("adds live recommendations to the top of the funnel", () => {
    const stages = funnel(rows, 5);
    expect(stages[0]).toMatchObject({ stage: "recommended", count: 31 });
    expect(stages.find((s) => s.stage === "replied")?.count).toBe(9);
  });

  it("writes a templated callout for the best combination", () => {
    expect(insightCallouts(learningTable(rows))[0]).toBe("Budget objections reopen best after funding: 41% reply rate.");
  });
});
