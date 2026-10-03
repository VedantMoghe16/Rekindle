import { describe, expect, it } from "vitest";
import { businessHours, nextSlot, paymentProfile, quietestHour } from "@/lib/vyapar/contact-timing";

const bakery = paymentProfile({ id: "m-karan", category: "Bakery", qrVolumeBand: "High" });
const kitchen = paymentProfile({ id: "m-biryani", category: "Cloud kitchen", qrVolumeBand: "High" });

describe("contact timing from the payment pattern", () => {
  it("derives business hours from first and last regular payment", () => {
    expect(businessHours(bakery)).toEqual({ open: 6, close: 22 });
    expect(businessHours(kitchen).open).toBe(10);
  });
  it("picks the quietest open hour (bakery mid-afternoon, kitchen between lunch and dinner)", () => {
    expect([14, 15]).toContain(quietestHour(bakery));
    expect([16, 17]).toContain(quietestHour(kitchen));
  });
  it("schedules today if the hour is ahead, tomorrow if it has passed, now if we're in it", () => {
    const q = quietestHour(bakery);
    const morning = new Date("2026-10-04T09:00:00+05:30");
    const evening = new Date("2026-10-04T20:00:00+05:30");
    expect(nextSlot("quiet", bakery, morning).note).toMatch(/^Today/);
    expect(nextSlot("quiet", bakery, evening).at.toISOString()).toBe(new Date(`2026-10-05T${String(q).padStart(2, "0")}:05:00+05:30`).toISOString());
    expect(nextSlot("quiet", bakery, new Date(`2026-10-04T${String(q).padStart(2, "0")}:30:00+05:30`)).note).toMatch(/^Now/);
    expect(nextSlot("now", bakery, evening).at).toEqual(evening);
  });
  it("never puts another shop's payment data or hours in the note the seller sees", () => {
    for (const strategy of ["quiet", "after_open", "now"] as const) {
      const note = nextSlot(strategy, bakery, new Date("2026-10-04T09:00:00+05:30")).note;
      expect(note).not.toMatch(/payment|open \d|\d+(\.\d+)? on average|–/i);
    }
  });
  it("is stable per shop", () => {
    expect(paymentProfile({ id: "m-karan", category: "Bakery", qrVolumeBand: "High" })).toEqual(bakery);
  });
});
