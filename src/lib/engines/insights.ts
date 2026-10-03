import type { Lane, StallCategory } from "@/lib/schemas";

/** UI labels for the stall taxonomy (spec §3.1). */
export const CATEGORY_LABELS: Record<StallCategory, string> = {
  BUDGET: "Budget",
  TIMING: "Timing / priority",
  NO_OWNER: "No owner / team yet",
  CHAMPION_LEFT: "Champion left",
  COMPETITOR_LOCKIN: "Locked into competitor",
  MISSING_FEATURE: "Missing feature",
  IMPLEMENTATION_EFFORT: "Implementation effort",
  INTERNAL_APPROVAL: "Internal approval",
  WENT_DARK: "Went dark",
  OTHER: "Other",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as StallCategory] ?? category.replaceAll("_", " ").toLowerCase();
}

export type ObjectionRow = {
  dealId: string;
  accountId: string;
  accountName: string;
  industry?: string | null;
  valueInr: number;
  lane: Lane | string;
  stallCategory: StallCategory | string;
  quote: string;
  speaker?: string | null;
  title?: string | null;
  date?: Date | string | null;
};

export type ObjectionQuote = { quote: string; speaker: string | null; title: string | null; company: string; industry: string | null; date: string | null; accountId: string; valueInr: number };

export type ObjectionAccount = { accountId: string; dealId: string; name: string; lane: string; valueInr: number; title: string | null };

export type ObjectionGroup = {
  category: string;
  label: string;
  count: number;
  valueInr: number;
  share: number;
  quotes: ObjectionQuote[];
  accountIds: string[];
  accounts: ObjectionAccount[];
  lanes: Record<string, number>;
};

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Groups stalled-deal memories by stall category. Sorted by deal count, then ₹ value; quotes are the top 5 by deal value. */
export function aggregateObjections(rows: ObjectionRow[]): ObjectionGroup[] {
  const total = rows.length;
  const groups = new Map<string, ObjectionRow[]>();
  for (const row of rows) groups.set(row.stallCategory, [...(groups.get(row.stallCategory) ?? []), row]);
  return [...groups.entries()]
    .map(([category, items]) => {
      const sorted = [...items].sort((a, b) => b.valueInr - a.valueInr || a.accountName.localeCompare(b.accountName));
      const lanes: Record<string, number> = {};
      for (const item of items) lanes[item.lane] = (lanes[item.lane] ?? 0) + 1;
      return {
        category,
        label: categoryLabel(category),
        count: items.length,
        valueInr: items.reduce((sum, item) => sum + item.valueInr, 0),
        share: total ? items.length / total : 0,
        quotes: sorted.filter((item) => item.quote.trim()).slice(0, 5).map((item) => ({
          quote: item.quote, speaker: item.speaker ?? null, title: item.title ?? null, company: item.accountName,
          industry: item.industry ?? null, date: isoDate(item.date), accountId: item.accountId, valueInr: item.valueInr,
        })),
        accountIds: [...new Set(sorted.map((item) => item.accountId))],
        accounts: sorted.map((item) => ({ accountId: item.accountId, dealId: item.dealId, name: item.accountName, lane: String(item.lane), valueInr: item.valueInr, title: item.title ?? null })),
        lanes,
      };
    })
    .sort((a, b) => b.count - a.count || b.valueInr - a.valueInr || a.category.localeCompare(b.category));
}

/** Replaces company and person names with neutral tokens so quotes can be shown to an LLM or in public copy. */
export function anonymiseQuote(quote: string, companies: string[], people: string[] = []): string {
  let text = quote;
  const tokens = [...companies, ...people.flatMap((name) => [name, ...name.split(/\s+/).filter((part) => part.length >= 3)])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[name]");
  }
  return text;
}
