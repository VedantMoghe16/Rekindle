import { DiscoveryCriteria } from "@/lib/schemas";
import { freshness } from "@/lib/engines/match";

export const DEFAULT_CRITERIA: DiscoveryCriteria = {
  geographies: ["India"],
  industries: ["SaaS", "Fintech", "Healthtech"],
  cities: [],
  employeeMin: 50,
  employeeMax: 500,
  fundingStages: ["Series A", "Series B", "Series C"],
  personas: ["CTO", "Head of Security"],
  signals: ["security hiring", "compliance hiring", "enterprise expansion"],
  exclusions: ["agencies", "consultancies", "current customers"],
};

export const CANONICAL_INDUSTRIES = ["SaaS", "Fintech", "Healthtech", "Logistics", "HR Tech", "Devtools", "Edtech", "Ecommerce enablement"];
export const FUNDING_STAGES = ["Bootstrapped", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E", "Late stage", "Public"];
export const knownCities = ["Bengaluru", "Mumbai", "Pune", "Kochi", "Chennai", "Gurugram", "Hyderabad", "Ahmedabad", "Noida", "Jaipur", "New Delhi", "Kolkata"];
export const knownIndustries = CANONICAL_INDUSTRIES;

const INDUSTRY_ALIASES: Record<string, string[]> = {
  SaaS: ["saas", "b2b software"],
  Fintech: ["fintech", "fin tech", "payments", "bfsi"],
  Healthtech: ["healthtech", "health tech", "healthcare"],
  Logistics: ["logistics", "supply chain"],
  "HR Tech": ["hr tech", "hrtech", "hr-tech"],
  Devtools: ["devtools", "dev tools", "developer tools", "developer platform"],
  Edtech: ["edtech", "ed tech", "education"],
  "Ecommerce enablement": ["ecommerce enablement", "ecommerce", "e-commerce", "d2c enablement"],
};
const CITY_ALIASES: Record<string, string[]> = { Bengaluru: ["bengaluru", "bangalore"], Gurugram: ["gurugram", "gurgaon"], "New Delhi": ["new delhi", "delhi"] };
const KNOWN_PERSONAS: [RegExp, string][] = [
  [/\bctos?\b/i, "CTO"], [/\bcisos?\b/i, "CISO"], [/\bheads? of security\b/i, "Head of Security"], [/\bvps? (of )?engineering\b/i, "VP Engineering"],
  [/\bheads? of compliance\b/i, "Head of Compliance"], [/\bheads? of platform\b/i, "Head of Platform"], [/\bcfos?\b/i, "CFO"], [/\bceos?|founders?\b/i, "Founder/CEO"],
  [/\bchros?|heads? of (hr|people)\b/i, "Head of People"], [/\bheads? of (devops|infrastructure|infra)\b/i, "Head of Infrastructure"],
];
const HIRING_FUNCTIONS = ["security", "compliance", "platform", "devops", "infrastructure", "data", "sales", "engineering"];

function aliasesFor(industry: string) {
  return INDUSTRY_ALIASES[industry] ?? [industry.toLowerCase()];
}
function mentions(lower: string, words: string[]) {
  return words.some((word) => new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(lower));
}

/** Normalize an industry label to the canonical list (case-insensitive, aliases allowed). */
export function canonicalIndustry(value: string): string | null {
  const lower = value.toLowerCase().trim();
  return CANONICAL_INDUSTRIES.find((industry) => industry.toLowerCase() === lower || aliasesFor(industry).includes(lower)) ?? null;
}

function expandStages(from: string, to: string) {
  const letters = "abcdefgh";
  const start = letters.indexOf(from.toLowerCase());
  const end = letters.indexOf(to.toLowerCase());
  if (start < 0 || end < start) return [];
  return letters.slice(start, end + 1).split("").map((letter) => `Series ${letter.toUpperCase()}`);
}

/** Deterministic keyword compiler (rules mode). Refines `current` instead of replacing it. */
export function compileDiscoveryPrompt(prompt: string, current: DiscoveryCriteria = DEFAULT_CRITERIA): DiscoveryCriteria {
  const lower = prompt.toLowerCase();
  const next = structuredClone(current);
  const refining = lower.includes("only") || lower.includes("focus");
  const mentionedCities = knownCities.filter((city) => mentions(lower, CITY_ALIASES[city] ?? [city.toLowerCase()]));
  if (mentionedCities.length && refining) next.cities = mentionedCities;
  if (lower.includes("all india") || lower.includes("anywhere in india")) next.cities = [];
  const excluded = CANONICAL_INDUSTRIES.filter((industry) => aliasesFor(industry).some((alias) => lower.includes(`exclude ${alias}`) || lower.includes(`no ${alias}`) || lower.includes(`not ${alias}`)));
  const mentionedIndustries = CANONICAL_INDUSTRIES.filter((industry) => !excluded.includes(industry) && mentions(lower, aliasesFor(industry)));
  if (mentionedIndustries.length && refining) next.industries = mentionedIndustries;
  else if (mentionedIndustries.length) next.industries = [...new Set([...next.industries, ...mentionedIndustries])];
  next.industries = next.industries.filter((industry) => !excluded.includes(industry));

  const range = lower.match(/(\d{1,5})\s*(?:–|-|to)\s*(\d{1,5})\s*(?:employees|people|staff|headcount)/);
  if (range) { next.employeeMin = Number(range[1]); next.employeeMax = Math.max(Number(range[1]) + 1, Number(range[2])); }
  const stageRange = lower.match(/series\s+([a-h])\s*(?:–|-|to|through)\s*(?:series\s+)?([a-h])\b/);
  if (stageRange) next.fundingStages = expandStages(stageRange[1], stageRange[2]);
  else {
    const singles = [...lower.matchAll(/series\s+([a-h])\b/g)].map((match) => `Series ${match[1].toUpperCase()}`);
    if (singles.length) next.fundingStages = [...new Set(singles)];
  }
  if (/\bseed\b/.test(lower) && !next.fundingStages.includes("Seed")) next.fundingStages.unshift("Seed");
  if (/late[- ]stage/.test(lower) && !next.fundingStages.includes("Late stage")) next.fundingStages.push("Late stage");
  if (/\bbootstrapped\b/.test(lower) && !next.fundingStages.includes("Bootstrapped")) next.fundingStages.push("Bootstrapped");

  const personas = KNOWN_PERSONAS.filter(([pattern]) => pattern.test(prompt)).map(([, persona]) => persona);
  if (personas.length && /\b(target|reach|sell to|persona|buyer)/.test(lower)) next.personas = [...new Set(personas)];
  else for (const persona of personas) if (!next.personas.includes(persona)) next.personas.push(persona);

  const signals: string[] = [];
  if (lower.includes("security leader") || lower.includes("head of security") && lower.includes("new")) signals.push("security leadership");
  if (lower.includes("hiring")) for (const fn of HIRING_FUNCTIONS) if (lower.includes(fn)) signals.push(`${fn} hiring`);
  if (lower.includes("compliance") && !signals.includes("compliance hiring")) signals.push("compliance hiring");
  if (/sell(s|ing)? to enterprise|enterprise customers|enterprises/.test(lower)) signals.push("enterprise expansion");
  if (/funding|raised|raises/.test(lower)) signals.push("recent funding");
  if (signals.length) next.signals = [...new Set([...signals, ...next.signals])];
  return DiscoveryCriteria.parse(next);
}

export type CandidateForFilter = { city: string; industry: string; sizeBand: string; fundingStage: string | null; tagsJson: string };

/** Strict filter used for the fictional demo candidates. */
export function candidateMatches(candidate: CandidateForFilter, criteria: DiscoveryCriteria): boolean {
  if (criteria.cities.length && !criteria.cities.includes(candidate.city)) return false;
  if (!criteria.industries.some((industry) => industry.toLowerCase() === candidate.industry.toLowerCase())) return false;
  const upper = Number(candidate.sizeBand.split(/[–-]/).at(-1));
  if (Number.isFinite(upper) && (upper < criteria.employeeMin || upper > criteria.employeeMax)) return false;
  if (!candidate.fundingStage || !criteria.fundingStages.includes(candidate.fundingStage)) return false;
  const tags = JSON.parse(candidate.tagsJson) as string[];
  if (criteria.signals[0] === "security leadership" && !tags.some((tag) => tag === "leadership" || tag === "security-hiring")) return false;
  return true;
}

export type CompanyForScoring = { name: string; domain?: string; industry: string; city: string; sizeBand: string; fundingStage: string | null; tags: string[]; description?: string | null };

/** Parse "51–200" / "5000+" into [min, max]. */
export function parseSizeBand(band: string): [number, number] | null {
  const plus = band.match(/^(\d+)\+$/);
  if (plus) return [Number(plus[1]), Number.POSITIVE_INFINITY];
  const parts = band.split(/[–-]/).map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) ? [parts[0], parts[1]] : null;
}

/**
 * Registry filter for real companies. Excludes only on industry, explicit city filter and exclusions;
 * size and funding mismatches lower the fit score instead of excluding.
 */
export function companyMatches(company: CompanyForScoring, criteria: DiscoveryCriteria): boolean {
  if (criteria.industries.length && !criteria.industries.some((industry) => (canonicalIndustry(industry) ?? industry).toLowerCase() === company.industry.toLowerCase())) return false;
  if (criteria.cities.length && !criteria.cities.some((city) => city.toLowerCase() === company.city.toLowerCase())) return false;
  const haystack = [company.name, company.domain ?? "", company.industry, ...company.tags].map((value) => value.toLowerCase());
  for (const exclusion of criteria.exclusions) {
    const term = exclusion.toLowerCase().trim();
    if (term.length > 2 && haystack.some((value) => value === term || value === canonicalIndustry(term)?.toLowerCase())) return false;
  }
  return true;
}

const SIGNAL_TAGS: Record<string, string[]> = {
  security: ["security", "soc2", "pci-dss", "kyc", "data-protection", "regulated-data"],
  compliance: ["compliance", "soc2", "regulated-data", "pci-dss", "healthcare-data", "bfsi", "kyc"],
  enterprise: ["enterprise-sales", "global-customers"],
  platform: ["platform", "devops", "api-first", "data-platform"],
  devops: ["devops", "platform", "testing"],
  infrastructure: ["devops", "platform", "data-platform"],
  data: ["data-platform", "customer-data", "healthcare-data"],
  payments: ["payments", "pci-dss"],
  ai: ["ai"],
};

/** Deterministic ICP fit from registry facts only. Returns 0–100 and human-readable reasons (never invents facts). */
export function heuristicFit(company: CompanyForScoring, criteria: DiscoveryCriteria): { fitScore: number; whyFit: string[] } {
  const why: string[] = [];
  let score = 0;
  if (!criteria.industries.length || criteria.industries.some((industry) => (canonicalIndustry(industry) ?? industry).toLowerCase() === company.industry.toLowerCase())) { score += 30; why.push(`${company.industry} matches the target industries`); }
  if (criteria.cities.length) {
    if (criteria.cities.some((city) => city.toLowerCase() === company.city.toLowerCase())) { score += 15; why.push(`Headquartered in ${company.city}`); }
  } else if (!criteria.geographies.length || criteria.geographies.some((geo) => geo.toLowerCase() === "india")) { score += 15; why.push(`India-based (${company.city})`); }
  const band = parseSizeBand(company.sizeBand);
  if (band) {
    const [lo, hi] = band;
    const overlap = Math.min(hi, criteria.employeeMax) - Math.max(lo, criteria.employeeMin);
    if (lo >= criteria.employeeMin && hi <= criteria.employeeMax) { score += 20; why.push(`${company.sizeBand} employees fits the ${criteria.employeeMin}–${criteria.employeeMax} target`); }
    else if (overlap > 0) { score += 12; why.push(`${company.sizeBand} employees partly overlaps the target size`); }
    else if (lo > criteria.employeeMax) { score += lo <= criteria.employeeMax * 2.1 ? 5 : 0; why.push(`Larger than target (${company.sizeBand} employees)`); }
    else { score += 3; why.push(`Smaller than target (${company.sizeBand} employees)`); }
  } else why.push("Headcount unknown");
  if (!criteria.fundingStages.length) score += 15;
  else if (!company.fundingStage) { score += 5; why.push("Funding stage unknown"); }
  else if (criteria.fundingStages.includes(company.fundingStage)) { score += 15; why.push(`${company.fundingStage} is in the target stages`); }
  else { const near = isAdjacentStage(company.fundingStage, criteria.fundingStages); score += near ? 7 : 0; why.push(`${company.fundingStage}${near ? " is adjacent to" : " is outside"} the target stages`); }
  const wanted = new Set<string>();
  for (const phrase of [...criteria.signals, ...criteria.personas]) for (const word of phrase.toLowerCase().split(/[^a-z0-9]+/)) for (const tag of SIGNAL_TAGS[word] ?? []) wanted.add(tag);
  const matched = company.tags.filter((tag) => wanted.has(tag));
  if (matched.length) { score += Math.min(20, matched.length * 5); why.push(`Profile signals: ${matched.slice(0, 4).join(", ")}`); }
  const wantsCompliance = [...criteria.signals].some((signal) => /compliance|security/i.test(signal));
  if (wantsCompliance && company.tags.includes("compliance-vendor")) { score -= 25; why.push("Sells compliance software itself (likely competitor)"); }
  return { fitScore: Math.max(0, Math.min(100, Math.round(score))), whyFit: why };
}

function isAdjacentStage(stage: string, targets: string[]) {
  const index = FUNDING_STAGES.indexOf(stage);
  return index >= 0 && targets.some((target) => Math.abs(FUNDING_STAGES.indexOf(target) - index) === 1);
}

export const TIMING_WEIGHTS: Record<string, number> = { LEADERSHIP_CHANGE: 80, FUNDING: 70, HIRING_RELEVANT: 60, EXPANSION: 55, PRODUCT_LAUNCH: 45 };
export const NO_TIMING_SCORE = 15;
export type TimingSignal = { type: string; occurredAt: Date; roleCount?: number };

/** Strongest signal weight × freshness; future-dated evidence counts as fresh (age 0). `stale` (cache fallback) discounts by 10%. */
export function computeTiming(signals: TimingSignal[], today: Date, options: { stale?: boolean } = {}): number {
  let best = 0;
  for (const signal of signals) {
    let weight = TIMING_WEIGHTS[signal.type];
    if (!weight) continue;
    if (signal.type === "HIRING_RELEVANT") weight = Math.min(85, weight + 5 * Math.max(0, (signal.roleCount ?? 1) - 1));
    const date = signal.occurredAt.getTime() > today.getTime() ? today : signal.occurredAt;
    best = Math.max(best, weight * freshness(date, today));
  }
  if (best <= 0) return NO_TIMING_SCORE;
  return Math.max(NO_TIMING_SCORE, Math.round(best * (options.stale ? 0.9 : 1)));
}

export function overallScore(fitScore: number, timingScore: number): number {
  return Math.round(0.6 * fitScore + 0.4 * timingScore);
}

export function confidenceFor(evidenceCount: number, stale: boolean): "HIGH" | "MEDIUM" | "LOW" {
  if (evidenceCount >= 3 && !stale) return "HIGH";
  if (evidenceCount >= 1) return "MEDIUM";
  return "LOW";
}

/** Pick the persona that best matches the evidence (security/compliance → security persona), else the first persona. */
export function suggestPersona(criteria: DiscoveryCriteria, evidenceText: string[]): string {
  const text = evidenceText.join(" ").toLowerCase();
  const personas = criteria.personas.length ? criteria.personas : ["CTO"];
  if (/security|compliance|ciso|grc/.test(text)) {
    const security = personas.find((persona) => /security|ciso|compliance/i.test(persona));
    if (security) return security;
  }
  if (/platform|infra|devops|sre/.test(text)) {
    const tech = personas.find((persona) => /cto|engineering|platform|infra/i.test(persona));
    if (tech) return tech;
  }
  return personas[0];
}

/** Role keywords for job-board matching: words from "<x> hiring" signals plus the seller's own keywords. */
export function roleKeywordsFor(criteria: DiscoveryCriteria, sellerKeywords: string[] = []): string[] {
  const fromSignals = criteria.signals.filter((signal) => /hiring|leadership/i.test(signal)).map((signal) => signal.toLowerCase().replace(/\s*(hiring|leadership)\s*/g, "").trim()).filter(Boolean);
  const keywords = [...fromSignals, ...sellerKeywords.map((keyword) => keyword.toLowerCase())];
  if (keywords.includes("security")) keywords.push("grc", "appsec", "infosec", "ciso");
  if (keywords.includes("platform")) keywords.push("sre", "site reliability", "devops", "infrastructure");
  return [...new Set(keywords)];
}

export function criteriaSummary(criteria: DiscoveryCriteria): string {
  const location = criteria.cities.length ? criteria.cities.join(" and ") : criteria.geographies.join(", ");
  return `${criteria.industries.join(", ")} companies in ${location}, ${criteria.employeeMin}–${criteria.employeeMax} employees, ${criteria.fundingStages.join("–")}. Prioritize ${criteria.signals.slice(0, 3).join(", ")}.`;
}
