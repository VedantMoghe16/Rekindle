import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import {
  candidateMatches, canonicalIndustry, companyMatches, compileDiscoveryPrompt, computeTiming, confidenceFor, criteriaSummary,
  heuristicFit, overallScore, roleKeywordsFor, suggestPersona, type CompanyForScoring,
} from "@/lib/engines/discovery";
import { callStructured } from "@/lib/providers/llm";
import { icpSystemPrompt, icpUserPrompt, type SellerContext } from "@/lib/prompts/icp";
import { leadFitSystemPrompt, leadFitUserPrompt, type LeadFitInput } from "@/lib/prompts/lead-fit";
import { DiscoveryCriteria, IcpCompile, LeadFitScores } from "@/lib/schemas";
import { classifyHeadline, collectCompanyEvidence, type CompanyEvidence } from "@/lib/sources";

const THREAD_ID = "discovery-main";
export const ENRICH_LIMIT = 25;
const BATCH_SIZE = 5;

export type CompileProvenance = "live" | "cached" | "rules";
export type ProductProfile = { name: string; product: string; capabilities: string[]; proofPoints: string[] };

function parseList(json: string | null | undefined): string[] {
  try { const value = JSON.parse(json ?? "[]"); return Array.isArray(value) ? value.map(String) : []; } catch { return []; }
}

async function sellerContext(): Promise<SellerContext> {
  const seller = await db.sellerProfile.findFirst();
  if (!seller) return null;
  return { name: seller.name, oneLiner: seller.oneLiner, product: seller.product, icp: seller.icp, personas: parseList(seller.personasJson), proofPoints: parseList(seller.proofPointsJson), roleKeywords: parseList(seller.roleKeywordsJson) };
}

function sanitizeCriteria(criteria: DiscoveryCriteria, fallback: DiscoveryCriteria): DiscoveryCriteria {
  const industries = [...new Set(criteria.industries.map(canonicalIndustry).filter((value): value is string => Boolean(value)))];
  const employeeMin = Math.max(0, Math.round(criteria.employeeMin));
  const employeeMax = Math.max(employeeMin + 1, Math.round(criteria.employeeMax));
  return DiscoveryCriteria.parse({ ...criteria, industries: industries.length ? industries : fallback.industries, employeeMin, employeeMax, geographies: criteria.geographies.length ? criteria.geographies : ["India"] });
}

const CAPABILITY_TERMS: [RegExp, string][] = [
  [/soc ?2/i, "SOC 2 readiness"], [/iso ?27001/i, "ISO 27001 evidence collection"], [/gdpr/i, "GDPR compliance"], [/hipaa/i, "HIPAA compliance"],
  [/dpdp/i, "DPDP Act readiness"], [/pci/i, "PCI DSS compliance"], [/cloud security|posture/i, "Cloud security posture monitoring"], [/vapt|pentest|penetration/i, "Penetration testing"],
];

function rulesClarifications(prompt: string, current: DiscoveryCriteria, next: DiscoveryCriteria): string[] {
  const lower = prompt.toLowerCase();
  if (prompt.length < 60) return [];
  const questions: string[] = [];
  if (!/\d+\s*(?:–|-|to)\s*\d+\s*(employees|people|staff)/.test(lower) && next.employeeMin === current.employeeMin) questions.push(`Should I keep the ${next.employeeMin}–${next.employeeMax} employee range?`);
  if (!/series|seed|bootstrapped|late[- ]stage|funded/.test(lower)) questions.push(`Which funding stages matter? I assumed ${next.fundingStages.join(", ")}.`);
  if (!/target|cto|ciso|head of|vp|founder|ceo|cfo/.test(lower)) questions.push(`Who is the buyer? I assumed ${next.personas.join(" and ")}.`);
  return questions.slice(0, 3);
}

/** Compile a natural-language prompt into criteria. Uses Claude when available, else the deterministic keyword compiler. */
export async function compileIcp(prompt: string, current: DiscoveryCriteria) {
  const seller = await sellerContext();
  try {
    const result = await callStructured({ tier: "smart", system: icpSystemPrompt(), user: icpUserPrompt(prompt, current, seller), schema: IcpCompile, schemaName: "IcpCompile", maxTokens: 4000 });
    const criteria = sanitizeCriteria(result.data.criteria, current);
    const profile = result.data.product_profile;
    return {
      criteria, summary: result.data.summary || criteriaSummary(criteria),
      productProfile: { name: profile.name, product: profile.product, capabilities: profile.capabilities, proofPoints: profile.proof_points } satisfies ProductProfile,
      clarifications: result.data.clarifications.slice(0, 3), provenance: result.provenance as CompileProvenance,
    };
  } catch {
    const criteria = compileDiscoveryPrompt(prompt, current);
    const capabilities = CAPABILITY_TERMS.filter(([pattern]) => pattern.test(prompt)).map(([, label]) => label);
    return {
      criteria, summary: criteriaSummary(criteria),
      productProfile: {
        name: seller?.name ?? "Your product", product: seller?.product ?? prompt.slice(0, 140),
        capabilities: capabilities.length ? capabilities : seller ? [seller.oneLiner] : [], proofPoints: seller?.proofPoints ?? [],
      } satisfies ProductProfile,
      clarifications: rulesClarifications(prompt, current, criteria), provenance: "rules" as CompileProvenance,
    };
  }
}

export async function findCandidates(criteria: DiscoveryCriteria) {
  const candidates = await db.leadCandidate.findMany({ where: { isDemo: true }, include: { evidence: { orderBy: { observedAt: "desc" } } }, orderBy: [{ overallScore: "desc" }, { name: "asc" }] });
  return candidates.filter((candidate) => candidateMatches(candidate, criteria));
}

/** Curated (real) candidates already researched, filtered by the current criteria. */
export async function findCuratedCandidates(criteria: DiscoveryCriteria) {
  const candidates = await db.leadCandidate.findMany({ where: { source: "curated" }, include: { evidence: { orderBy: { observedAt: "desc" } } }, orderBy: [{ overallScore: "desc" }, { name: "asc" }] });
  return candidates.filter((candidate) => companyMatches({ ...candidate, tags: parseList(candidate.tagsJson) }, criteria));
}

type CandidateWithEvidence = Awaited<ReturnType<typeof findCandidates>>[number];

export function serializeCandidate(candidate: CandidateWithEvidence) {
  return {
    ...candidate, whyFit: parseList(candidate.whyFitJson), tags: parseList(candidate.tagsJson),
    evidence: candidate.evidence.map((item) => ({ ...item, observedAt: item.observedAt.toISOString() })),
  };
}
export type SerializedCandidate = ReturnType<typeof serializeCandidate>;

async function ensureThread(criteria: DiscoveryCriteria) {
  return db.discoveryThread.upsert({ where: { id: THREAD_ID }, create: { id: THREAD_ID, title: "Find accounts", currentCriteriaJson: JSON.stringify(criteria) }, update: {}, include: { icpVersions: true } });
}

/** Thread bookkeeping (message, ICP version, research run). Pass precomputed results; omitted → demo candidates. */
export async function saveDiscoveryRun(prompt: string, criteria: DiscoveryCriteria, precomputed?: { results: SerializedCandidate[]; isDemo: boolean; note?: string }) {
  const results = precomputed?.results ?? (await findCandidates(criteria)).map(serializeCandidate);
  const isDemo = precomputed?.isDemo ?? true;
  const thread = await ensureThread(criteria);
  const nextVersion = Math.max(0, ...thread.icpVersions.map((item) => item.version)) + 1;
  await db.$transaction([
    db.chatMessage.create({ data: { threadId: thread.id, role: "user", content: prompt } }),
    db.chatMessage.create({ data: { threadId: thread.id, role: "assistant", content: `I found ${results.length} candidates. ${precomputed?.note ? `${precomputed.note} ` : ""}${criteriaSummary(criteria)}` } }),
    db.icpVersion.create({ data: { threadId: thread.id, version: nextVersion, prompt, criteriaJson: JSON.stringify(criteria) } }),
    db.researchRun.create({ data: { threadId: thread.id, criteriaJson: JSON.stringify(criteria), resultCount: results.length, status: "completed", isDemo } }),
    db.discoveryThread.update({ where: { id: thread.id }, data: { currentCriteriaJson: JSON.stringify(criteria) } }),
  ]);
  return results;
}

type Scored = { company: CompanyForScoring & { id: string; domain: string; careersProvider: string; careersToken: string | null }; fitScore: number; whyFit: string[] };

async function llmFit(criteria: DiscoveryCriteria, product: string, items: { scored: Scored; evidence: CompanyEvidence | null }[]) {
  try {
    const companies: LeadFitInput[] = items.map(({ scored, evidence }) => ({
      domain: scored.company.domain, name: scored.company.name, industry: scored.company.industry, city: scored.company.city, sizeBand: scored.company.sizeBand,
      fundingStage: scored.company.fundingStage, tags: scored.company.tags, description: scored.company.description ?? null,
      evidence: (evidence?.evidence ?? []).slice(0, 4).map((item) => ({ title: item.title, excerpt: item.excerpt, sourceName: item.sourceName, observedAt: item.observedAt.toISOString().slice(0, 10) })),
    }));
    const result = await callStructured({ tier: "fast", system: leadFitSystemPrompt(), user: leadFitUserPrompt(criteria, product, companies), schema: LeadFitScores, schemaName: "LeadFitScores", maxTokens: 6000 });
    return { scores: new Map(result.data.scores.map((score) => [score.domain, score])), provenance: result.provenance };
  } catch {
    return null;
  }
}

/**
 * Research real companies: filter the curated registry, rank by heuristic fit, enrich the top 25 with live
 * job-board and news evidence, optionally blend an LLM fit score, and persist LeadCandidates + LeadEvidence.
 */
export async function runDiscovery(prompt: string, criteria: DiscoveryCriteria, options: { enrichLimit?: number; saveRun?: boolean } = {}) {
  const today = now();
  const rows = await db.company.findMany({ orderBy: { name: "asc" } });
  const companies = rows.map((row) => ({ ...row, tags: parseList(row.tagsJson) }));
  const matching = companies.filter((company) => companyMatches(company, criteria));

  if (!matching.length) {
    const results = (await findCandidates(criteria)).map(serializeCandidate);
    if (options.saveRun !== false) await saveDiscoveryRun(prompt, criteria, { results, isDemo: true, note: "No curated companies matched, so these are fictional demo accounts." });
    return { candidates: results, stats: { scanned: 0, enriched: 0, stale: 0, liveEvidence: 0 }, mode: "demo" as const, fitProvenance: "rules" as const };
  }

  const ranked: Scored[] = matching.map((company) => ({ company, ...heuristicFit(company, criteria) })).sort((a, b) => b.fitScore - a.fitScore || a.company.name.localeCompare(b.company.name));
  const top = ranked.slice(0, options.enrichLimit ?? ENRICH_LIMIT);
  const seller = await sellerContext();
  const roleKeywords = roleKeywordsFor(criteria, seller?.roleKeywords ?? []);

  const enriched: { scored: Scored; evidence: CompanyEvidence | null }[] = [];
  for (let index = 0; index < top.length; index += BATCH_SIZE) {
    const batch = top.slice(index, index + BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((scored) => collectCompanyEvidence(scored.company, roleKeywords)));
    settled.forEach((result, offset) => enriched.push({ scored: batch[offset], evidence: result.status === "fulfilled" ? result.value : null }));
  }

  const llm = await llmFit(criteria, seller?.product ?? prompt, enriched);
  const enrichedAt = new Date();
  let staleCount = 0;
  let liveCount = 0;

  for (const { scored, evidence } of enriched) {
    const company = scored.company;
    const items = evidence?.evidence ?? [];
    const stale = Boolean(evidence?.stale) || !evidence;
    if (evidence?.stale) staleCount++;
    if (items.some((item) => item.provenance === "live")) liveCount++;
    const llmScore = llm?.scores.get(company.domain);
    const fitScore = llmScore ? Math.round((scored.fitScore + llmScore.fit_score) / 2) : scored.fitScore;
    const whyFit = llmScore?.why_fit.length ? llmScore.why_fit : scored.whyFit;
    const timingScore = computeTiming((evidence?.signals ?? []).map((signal) => ({ type: signal.type, occurredAt: signal.occurredAt, roleCount: signal.roleCount })), today, { stale: Boolean(evidence?.stale) });
    const signalEvidence = items.filter((item) => item.kind === "SIGNAL");
    const persona = llmScore && criteria.personas.includes(llmScore.suggested_persona) ? llmScore.suggested_persona : suggestPersona(criteria, signalEvidence.map((item) => `${item.title} ${item.excerpt}`));
    const id = `lead-${company.id.replace(/^co-/, "")}`;
    const data = {
      name: company.name, industry: company.industry, city: company.city, sizeBand: company.sizeBand, fundingStage: company.fundingStage,
      fitScore, timingScore, overallScore: overallScore(fitScore, timingScore), confidence: confidenceFor(signalEvidence.length + (items.length > signalEvidence.length ? 1 : 0), stale),
      suggestedPersona: persona, whyFitJson: JSON.stringify(whyFit), tagsJson: JSON.stringify(company.tags), isDemo: false, source: "curated", companyId: company.id, enrichedAt, stale,
    };
    const existing = await db.leadCandidate.findUnique({ where: { domain: company.domain } });
    const candidateId = existing?.id ?? id;
    await db.$transaction([
      existing ? db.leadCandidate.update({ where: { id: candidateId }, data }) : db.leadCandidate.create({ data: { id: candidateId, domain: company.domain, ...data } }),
      db.leadEvidence.deleteMany({ where: { candidateId } }),
      ...items.map((item) => db.leadEvidence.create({ data: {
        id: `${candidateId}:${item.dedupeKey}`.slice(0, 190), candidateId, kind: item.kind, title: item.title.slice(0, 300), excerpt: item.excerpt.slice(0, 600),
        sourceName: item.sourceName, sourceUrl: item.sourceUrl, observedAt: item.observedAt, confidence: item.confidence, isDemo: false, provenance: item.provenance,
      } })),
      db.company.update({ where: { id: company.id }, data: { lastEnrichedAt: enrichedAt } }),
    ]);
  }

  const ids = enriched.map(({ scored }) => scored.company.domain);
  const saved = await db.leadCandidate.findMany({ where: { domain: { in: ids } }, include: { evidence: { orderBy: { observedAt: "desc" } } }, orderBy: [{ overallScore: "desc" }, { name: "asc" }] });
  const candidates = saved.map(serializeCandidate);
  const stats = { scanned: matching.length, enriched: enriched.length, stale: staleCount, liveEvidence: liveCount };
  if (options.saveRun !== false) await saveDiscoveryRun(prompt, criteria, { results: candidates, isDemo: false, note: `Scanned ${stats.scanned} real companies and enriched ${stats.enriched} with job-board and news evidence.` });
  return { candidates, stats, mode: "curated" as const, fitProvenance: (llm?.provenance ?? "rules") as "live" | "cached" | "rules" };
}

/** Recover the signal type and dedupe key from a stored LeadEvidence row (id = `${candidateId}:${dedupeKey}`). */
export function evidenceSignal(candidateId: string, evidence: { id: string; title: string }) {
  const dedupeKey = evidence.id.startsWith(`${candidateId}:`) ? evidence.id.slice(candidateId.length + 1) : evidence.id;
  let type: string;
  if (dedupeKey.startsWith("news:")) type = classifyHeadline(evidence.title) ?? "EXPANSION";
  else if (dedupeKey.includes(":lead:")) type = "LEADERSHIP_CHANGE";
  else type = "HIRING_RELEVANT";
  return { type, dedupeKey };
}
