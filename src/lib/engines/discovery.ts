import { DiscoveryCriteria } from "@/lib/schemas";

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

const knownCities = ["Bengaluru", "Mumbai", "Pune", "Kochi", "Chennai", "Gurugram", "Hyderabad", "Ahmedabad", "Noida", "Jaipur"];
const knownIndustries = ["SaaS", "Fintech", "Healthtech"];

export function compileDiscoveryPrompt(prompt: string, current: DiscoveryCriteria = DEFAULT_CRITERIA): DiscoveryCriteria {
  const lower = prompt.toLowerCase();
  const next = structuredClone(current);
  const mentionedCities = knownCities.filter((city) => lower.includes(city.toLowerCase()));
  if (mentionedCities.length && (lower.includes("only") || lower.includes("focus"))) next.cities = mentionedCities;
  if (lower.includes("all india") || lower.includes("anywhere in india")) next.cities = [];
  const mentionedIndustries = knownIndustries.filter((industry) => lower.includes(industry.toLowerCase()));
  if (mentionedIndustries.length && (lower.includes("only") || lower.includes("focus"))) next.industries = mentionedIndustries;
  for (const industry of knownIndustries) {
    if (lower.includes(`exclude ${industry.toLowerCase()}`) || lower.includes(`no ${industry.toLowerCase()}`)) next.industries = next.industries.filter((item) => item !== industry);
  }
  if (lower.includes("security leader") || lower.includes("head of security")) next.signals = ["security leadership", ...next.signals.filter((item) => item !== "security leadership")];
  if (lower.includes("compliance")) next.signals = [...new Set(["compliance hiring", ...next.signals])];
  if (lower.includes("cto") && !next.personas.includes("CTO")) next.personas.push("CTO");
  return DiscoveryCriteria.parse(next);
}

export type CandidateForFilter = { city: string; industry: string; sizeBand: string; fundingStage: string | null; tagsJson: string };

export function candidateMatches(candidate: CandidateForFilter, criteria: DiscoveryCriteria): boolean {
  if (criteria.cities.length && !criteria.cities.includes(candidate.city)) return false;
  if (!criteria.industries.includes(candidate.industry)) return false;
  const upper = Number(candidate.sizeBand.split(/[–-]/).at(-1));
  if (Number.isFinite(upper) && (upper < criteria.employeeMin || upper > criteria.employeeMax)) return false;
  if (!candidate.fundingStage || !criteria.fundingStages.includes(candidate.fundingStage)) return false;
  const tags = JSON.parse(candidate.tagsJson) as string[];
  if (criteria.signals[0] === "security leadership" && !tags.some((tag) => tag === "leadership" || tag === "security-hiring")) return false;
  return true;
}

export function criteriaSummary(criteria: DiscoveryCriteria): string {
  const location = criteria.cities.length ? criteria.cities.join(" and ") : criteria.geographies.join(", ");
  return `${criteria.industries.join(", ")} companies in ${location}, ${criteria.employeeMin}–${criteria.employeeMax} employees, ${criteria.fundingStages.join("–")}. Prioritize ${criteria.signals.slice(0, 3).join(", ")}.`;
}
