import type { SellerPrefs } from "@/lib/vyapar/opportunity";

/** Skip reasons a seller can give. Each one becomes an explicit, undoable preference (no hidden model). */
export const SKIP_REASONS = [
  { code: "TOO_FAR", label: "Too far to deliver" },
  { code: "TOO_SMALL", label: "Their orders are too small for me" },
  { code: "CANT_SUPPLY", label: "I can't make what they need" },
  { code: "NOT_RELEVANT", label: "Not relevant / already know them" },
] as const;
export type SkipCode = (typeof SKIP_REASONS)[number]["code"];

export type PreferenceRow = { id: string; kind: string; reason: string | null; merchantId: string | null; category: string | null; value: string | null; label: string; active: boolean };
export type PreferenceDraft = Omit<PreferenceRow, "id" | "active">;

/** Turns a skip into the preference it implies, using facts about the skipped lead. */
export function preferenceFromSkip(code: SkipCode, lead: { merchantId: string; merchantName: string; category: string; distanceKm: number; band: string | null }): PreferenceDraft {
  switch (code) {
    case "TOO_FAR": {
      // A nearby lead called "too far" says more about that merchant than about the seller's range.
      if (lead.distanceKm < 1.5) return { kind: "EXCLUDE_MERCHANT", reason: code, merchantId: lead.merchantId, category: null, value: null, label: `skipped ${lead.merchantName} (too far)` };
      const km = Math.max(0.5, Math.floor((lead.distanceKm - 0.1) * 10) / 10);
      return { kind: "MAX_DISTANCE", reason: code, merchantId: lead.merchantId, category: null, value: String(km), label: `only buyers within ${km} km` };
    }
    case "TOO_SMALL": {
      const band = lead.band === "Low" ? "Medium" : "High";
      return { kind: "MIN_CAPACITY", reason: code, merchantId: lead.merchantId, category: null, value: band, label: `only buyers with ${band.toLowerCase()} or higher order volume` };
    }
    case "CANT_SUPPLY":
      return { kind: "EXCLUDE_CATEGORY", reason: code, merchantId: lead.merchantId, category: lead.category, value: null, label: `not supplying ${lead.category.toLowerCase()}s right now` };
    default:
      return { kind: "EXCLUDE_MERCHANT", reason: code, merchantId: lead.merchantId, category: null, value: null, label: `skipped ${lead.merchantName}` };
  }
}

/** Folds active preference rows (oldest first) into the ranking input. Later rows override earlier ones. */
export function buildPrefs(rows: PreferenceRow[]): SellerPrefs {
  const prefs: SellerPrefs = { excludedCategories: [], excludedMerchants: [], maxDistanceKm: null, minCapacity: null, saved: [], capacityAnswer: null };
  for (const r of rows.filter((x) => x.active)) {
    if (r.kind === "EXCLUDE_CATEGORY" && r.category) prefs.excludedCategories.push({ category: r.category, id: r.id, label: r.label });
    if (r.kind === "EXCLUDE_MERCHANT" && r.merchantId) prefs.excludedMerchants.push({ merchantId: r.merchantId, id: r.id, label: r.label });
    if (r.kind === "MAX_DISTANCE" && r.value) { const km = Number(r.value); if (!prefs.maxDistanceKm || km < prefs.maxDistanceKm.km) prefs.maxDistanceKm = { km, id: r.id, label: r.label }; }
    if (r.kind === "MIN_CAPACITY" && (r.value === "Medium" || r.value === "High")) prefs.minCapacity = { band: r.value, id: r.id, label: r.label };
    if (r.kind === "SAVE" && r.merchantId) prefs.saved.push({ merchantId: r.merchantId, id: r.id });
    if (r.kind === "CAPACITY_ANSWER") prefs.capacityAnswer = { canSupplyBulk: r.value === "yes", id: r.id, label: r.label };
  }
  return prefs;
}
