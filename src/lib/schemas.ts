import { z } from "zod";

export const StallCategory = z.enum([
  "BUDGET", "TIMING", "NO_OWNER", "CHAMPION_LEFT", "COMPETITOR_LOCKIN",
  "MISSING_FEATURE", "IMPLEMENTATION_EFFORT", "INTERNAL_APPROVAL", "WENT_DARK", "OTHER",
]);
export const SignalType = z.enum([
  "FUNDING", "HIRING_RELEVANT", "LEADERSHIP_CHANGE", "EXPANSION", "PRODUCT_LAUNCH",
  "COMPLIANCE_EVENT", "DATE_REACHED", "RENEWAL_WINDOW", "FEATURE_SHIPPED", "CAMPAIGN_ENGAGEMENT",
]);
export const Lane = z.enum(["REVIVE", "WARM", "WATCH"]);
export const Provenance = z.enum(["live", "demo", "computed", "simulated"]);

export type StallCategory = z.infer<typeof StallCategory>;
export type SignalType = z.infer<typeof SignalType>;
export type Lane = z.infer<typeof Lane>;

export const DiscoveryCriteria = z.object({
  geographies: z.array(z.string()),
  industries: z.array(z.string()),
  cities: z.array(z.string()),
  employeeMin: z.number().int().nonnegative(),
  employeeMax: z.number().int().positive(),
  fundingStages: z.array(z.string()),
  personas: z.array(z.string()),
  signals: z.array(z.string()),
  exclusions: z.array(z.string()),
});
export type DiscoveryCriteria = z.infer<typeof DiscoveryCriteria>;

export const MemoryExtraction = z.object({
  stall_category: StallCategory,
  stall_reason_summary: z.string().max(140),
  evidence_quote: z.string().max(220),
  evidence_speaker: z.string().nullable(),
  evidence_date: z.string().nullable(),
  stated_timing: z.object({ text: z.string().nullable(), resolved_date: z.string().nullable(), event_trigger: SignalType.nullable() }),
  competitor: z.object({ name: z.string().nullable(), contract_end_date: z.string().nullable() }),
  missing_feature: z.object({ description: z.string().nullable(), feature_key: z.string().nullable() }),
  stakeholders: z.array(z.object({
    name: z.string(), title: z.string().nullable(),
    role: z.enum(["champion", "decision_maker", "influencer", "blocker", "unknown"]),
    sentiment: z.enum(["positive", "neutral", "negative"]),
  })).max(8),
  commitments: z.array(z.object({ by: z.enum(["us", "them"]), text: z.string().max(160), due_date: z.string().nullable(), done: z.boolean() })).max(8),
  buyer_sentiment: z.enum(["warm", "neutral", "cold"]),
  language: z.enum(["en", "hi", "hinglish", "other"]),
  confidence: z.number().min(0).max(1),
});
