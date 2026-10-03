import type { DiscoveryCriteria } from "@/lib/schemas";

export type LeadFitInput = {
  domain: string;
  name: string;
  industry: string;
  city: string;
  sizeBand: string;
  fundingStage: string | null;
  tags: string[];
  description: string | null;
  evidence: { title: string; excerpt: string; sourceName: string; observedAt: string }[];
};

export function leadFitSystemPrompt(): string {
  return [
    "You score how well each company fits a seller's ideal customer profile.",
    "Rules:",
    "- Score only from the company facts and evidence provided. Do not use outside knowledge about these companies.",
    "- Never invent headcount, funding, customers, tech stack or people. If a fact needed for judgement is missing, say \"Unknown: <fact>\" in why_fit.",
    "- fit_score is 0–100 for ICP fit only (industry, size, stage, buyer need). Do not reward recent activity; timing is scored separately.",
    "- why_fit: 2–4 short, specific reasons citing the provided facts or evidence.",
    "- suggested_persona must be one of the personas in the criteria.",
    "- Return exactly one score per input company, using its domain.",
  ].join("\n");
}

export function leadFitUserPrompt(criteria: DiscoveryCriteria, product: string, companies: LeadFitInput[]): string {
  return [
    "<criteria>", JSON.stringify(criteria, null, 2), "</criteria>",
    "<seller_product>", product, "</seller_product>",
    "<companies>", JSON.stringify(companies, null, 2), "</companies>",
  ].join("\n");
}
