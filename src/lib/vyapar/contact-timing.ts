/**
 * When to contact a shop, from its Paytm payment pattern (average payments per hour of day).
 *   Business hours = first and last hour with regular payments (average earliest / latest payment).
 *   Quietest hour  = the open hour with the fewest payments: the owner is most likely free to talk.
 * Demo merchants are fictional, so their hourly pattern is generated per shop type (labelled demo data).
 * A real deployment reads the aggregated hourly counts from Paytm's payment data instead.
 */

export type TimingStrategy = "quiet" | "after_open" | "now";
export const TIMING_OPTIONS: { id: TimingStrategy; label: string; detail: string }[] = [
  { id: "quiet", label: "Quietest hour", detail: "Message and call in the open hour with the fewest Paytm payments, when the owner is most likely free." },
  { id: "after_open", label: "Just after opening", detail: "Reach them in the first hour after their usual first payment, before the rush." },
  { id: "now", label: "Right now", detail: "Ignore timing and contact immediately (for live demos)." },
];

/** Typical shape of a day's payments by shop type (relative weights per hour, 0–23). */
const SHAPES: Record<string, number[]> = {
  Bakery: [0, 0, 0, 0, 0, 0, 1, 4, 7, 6, 4, 3, 3, 2, 1, 1, 2, 4, 7, 8, 6, 3, 1, 0],
  "Sweet shop": [0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 4, 4, 3, 2, 2, 2, 3, 5, 7, 8, 7, 4, 1, 0],
  Cafe: [0, 0, 0, 0, 0, 0, 0, 2, 5, 6, 5, 4, 4, 3, 2, 2, 3, 5, 6, 6, 5, 3, 1, 0],
  "Cloud kitchen": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 6, 8, 5, 2, 1, 1, 3, 6, 8, 7, 4, 1],
  Restaurant: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 5, 7, 5, 2, 1, 1, 3, 6, 8, 7, 4, 1],
  "Fast food": [0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 3, 3, 5, 6, 4, 3, 3, 4, 6, 7, 6, 4, 2, 0],
};
const DEFAULT_SHAPE = [0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 4, 4, 4, 3, 3, 3, 3, 4, 5, 5, 4, 2, 1, 0];

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Average payments per hour (0–23) over recent weeks. Demo: shop-type shape × volume band, with a stable per-shop jitter. */
export function paymentProfile(m: { id: string; category: string; qrVolumeBand?: string | null }): number[] {
  const shape = SHAPES[m.category] ?? DEFAULT_SHAPE;
  const scale = { High: 6, Medium: 3.5, Low: 1.5 }[m.qrVolumeBand ?? ""] ?? 3;
  const seed = hash(m.id);
  return shape.map((w, h) => {
    if (w === 0) return 0;
    const jitter = 0.8 + ((seed >> (h % 24)) & 7) / 17;
    return Math.round(w * scale * jitter * 10) / 10;
  });
}

/** Business hours: first and last hour with at least one payment on average. */
export function businessHours(profile: number[]) {
  const open = profile.findIndex((v) => v >= 1);
  const close = profile.length - 1 - [...profile].reverse().findIndex((v) => v >= 1);
  return { open: Math.max(0, open), close: Math.max(open, close) };
}

/** The open hour with the fewest payments (ignoring the first and last open hour, which are setup and closing). */
export function quietestHour(profile: number[]) {
  const { open, close } = businessHours(profile);
  let best = open + 1;
  for (let h = open + 1; h <= close - 1; h++) if (profile[h] < profile[best]) best = h;
  return best;
}

export const hourLabel = (hour: number) => { const h = hour % 24; return `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`; };

function istParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Next time to contact (IST): within the target hour today if still possible, otherwise the same hour tomorrow. */
export function nextSlot(strategy: TimingStrategy, profile: number[], now: Date): { at: Date; hour: number | null; note: string } {
  const { open, close } = businessHours(profile);
  const hours = `open ${hourLabel(open)}–${hourLabel(close + 1)}`;
  if (strategy === "now") return { at: now, hour: null, note: `Right now (${hours})` };
  const hour = strategy === "quiet" ? quietestHour(profile) : Math.min(open + 1, close);
  const { date, hour: current } = istParts(now);
  const why = strategy === "quiet" ? `quietest hour, ${profile[hour]} payments on average` : "just after opening, before the rush";
  if (current === hour) return { at: now, hour, note: `Now: ${hourLabel(hour)} is their ${why} (${hours})` };
  const day = current < hour ? date : istParts(new Date(now.getTime() + 24 * 3_600_000)).date;
  const at = new Date(`${day}T${String(hour).padStart(2, "0")}:05:00+05:30`);
  return { at, hour, note: `${current < hour ? "Today" : "Tomorrow"} ${hourLabel(hour)}: their ${why} (${hours})` };
}
