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

export const IcpCompile = z.object({
  criteria: DiscoveryCriteria,
  summary: z.string(),
  product_profile: z.object({ name: z.string(), product: z.string(), capabilities: z.array(z.string()), proof_points: z.array(z.string()) }),
  clarifications: z.array(z.string()),
});
export type IcpCompile = z.infer<typeof IcpCompile>;

export const LeadFitScores = z.object({
  scores: z.array(z.object({
    domain: z.string(),
    fit_score: z.number().int().min(0).max(100),
    why_fit: z.array(z.string()),
    suggested_persona: z.string(),
  })),
});
export type LeadFitScores = z.infer<typeof LeadFitScores>;

export const DraftOutput = z.object({
  subject: z.string().nullable(),
  body: z.string(),
  why_this_works: z.array(z.string()),
});
export type DraftOutput = z.infer<typeof DraftOutput>;

export const CampaignDraft = z.object({
  campaign_name: z.string(),
  core_message: z.string(),
  rationale: z.string(),
  linkedin_post: z.string(),
  x_thread: z.array(z.string()),
  nurture_email: z.object({ subject: z.string(), body: z.string() }),
  landing_hero: z.object({ headline: z.string(), subhead: z.string(), cta: z.string() }),
  angle_tags: z.array(z.string()),
});
export type CampaignDraft = z.infer<typeof CampaignDraft>;

export const AskAnswer = z.object({ answer: z.string(), cited_ids: z.array(z.string()) });
export type AskAnswer = z.infer<typeof AskAnswer>;

export const OutcomeEvent = z.enum(["drafted", "sent", "replied", "meeting", "won", "no_response"]);
export type OutcomeEvent = z.infer<typeof OutcomeEvent>;
export type MemoryExtraction = z.infer<typeof MemoryExtraction>;
