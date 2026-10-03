"use client";

import { useState } from "react";
import { ArrowRight, Check, HelpCircle, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { EvidenceList, ProvenanceBadge, candidateProvenance, type EvidenceRow } from "./evidence-list";

type Criteria = { geographies: string[]; industries: string[]; cities: string[]; employeeMin: number; employeeMax: number; fundingStages: string[]; personas: string[]; signals: string[]; exclusions: string[] };
type Plan = { criteria: Criteria; summary: string; productProfile: { name: string; product: string; capabilities: string[]; proofPoints: string[] }; sources: string[]; clarifications?: string[]; provenance?: "live" | "cached" | "rules" };
type Candidate = { id: string; name: string; domain: string; industry: string; city: string; sizeBand: string; fundingStage: string | null; overallScore: number; fitScore: number; timingScore: number; confidence: string; suggestedPersona: string; whyFit: string[]; isDemo: boolean; stale: boolean; evidence: EvidenceRow[] };
type Stats = { scanned: number; enriched: number; stale: number; liveEvidence: number };

const sample = "We automate SOC 2 and ISO 27001 for Indian SaaS companies. Find Series A–C companies with 50–500 employees that sell to enterprises and are hiring security, platform or compliance roles. Target CTOs and Heads of Security.";
const PLAN_BADGE = { live: "Compiled by Claude", cached: "Cached", rules: "Rules" } as const;

function registrySize(plan: Plan | null) {
  const match = plan?.sources.join(" ").match(/\((\d+) companies\)/);
  return match ? Number(match[1]) : null;
}

export function DiscoveryWorkspace() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(sample);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([{ role: "assistant", text: "Tell me what you sell and who gets the most value. I’ll turn it into a research plan before searching." }]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState<"" | "plan" | "research">("");
  const [error, setError] = useState("");

  async function post(url: string, payload: unknown) {
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      return await response.json();
    } catch {
      return { ok: false, error: { message: "Network error. Check your connection and try again." } };
    }
  }
  async function createPlan() {
    setBusy("plan"); setError("");
    const body = await post("/api/discovery/plan", { prompt, criteria: plan?.criteria });
    setBusy("");
    if (!body.ok) { setError(body.error.message); return; }
    const next = body.data as Plan;
    const ask = next.clarifications?.length ? ` A few things to confirm: ${next.clarifications.join(" ")}` : "";
    setMessages((old) => [...old, { role: "user", text: prompt }, { role: "assistant", text: `I turned that into a research plan. Review the criteria, then run the search.${ask}` }]);
    setPlan(next); setCandidates([]); setStats(null); setPrompt("");
  }
  async function runResearch() {
    if (!plan) return; setBusy("research"); setError("");
    const lastPrompt = [...messages].reverse().find((message) => message.role === "user")?.text ?? sample;
    const body = await post("/api/discovery/run", { prompt: lastPrompt, criteria: plan.criteria });
    setBusy("");
    if (!body.ok) { setError(body.error.message); return; }
    setCandidates(body.data.candidates); setStats(body.data.stats); setIsDemo(Boolean(body.data.isDemo));
    const text = body.data.isDemo
      ? `No real companies matched this plan, so I’m showing ${body.data.candidates.length} fictional demo accounts.`
      : `Research complete. I scanned ${body.data.stats.scanned} real companies and enriched the top ${body.data.stats.enriched} with job-board and news evidence; ${body.data.stats.liveEvidence} have live evidence.`;
    setMessages((old) => [...old, { role: "assistant", text }]);
  }
  async function promote(id: string) {
    const body = await post(`/api/leads/${id}/promote`, {});
    if (body.ok) router.push(`/accounts/${body.data.accountId}`); else setError(body.error.message);
  }
  const researchCount = Math.min(25, registrySize(plan) ?? 25);
  return <div className="discovery-layout">
    <section className="chat-panel">
      <div className="chat-title"><span className="assistant-mark"><Sparkles /></span><div><strong>Find accounts</strong><div className="meta">Conversational research · Real Indian companies</div></div></div>
      <div className="messages">{messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}>{message.text}</div>)}</div>
      <div className="composer"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={plan ? "Refine the plan, e.g. “Only Bengaluru and Mumbai”" : "Describe what you sell and who buys it"} aria-label="Describe your target accounts" /><button onClick={createPlan} disabled={Boolean(busy) || prompt.trim().length < 4}>{busy === "plan" ? "Working…" : <><ArrowRight /> {plan ? "Update plan" : "Build plan"}</>}</button></div>
      {candidates.length > 0 && <div className="refine-hint">Try a refinement: “Only Bengaluru and Mumbai”, “exclude fintech” or “focus on Devtools”.</div>}
    </section>
    <main className="research-pane">
      {!plan && <div className="research-empty"><Search /><h2>Describe the market in your own words</h2><p>Rekindle will expose the exact filters, signals and sources before it researches accounts.</p></div>}
      {plan && <>
        <div className="plan-card">
          <div className="plan-head"><div><span className="eyebrow">Research plan</span><h2>{plan.summary}</h2></div><span className={`badge lead-plan-prov ${plan.provenance ?? "rules"}`}>{PLAN_BADGE[plan.provenance ?? "rules"]}</span></div>
          <div className="plan-grid">
            <PlanGroup label="Industries" values={plan.criteria.industries} />
            <PlanGroup label="Location" values={plan.criteria.cities.length ? plan.criteria.cities : plan.criteria.geographies} />
            <PlanGroup label="Company" values={[`${plan.criteria.employeeMin}–${plan.criteria.employeeMax} employees`, ...plan.criteria.fundingStages]} />
            <PlanGroup label="Personas" values={plan.criteria.personas} />
            <PlanGroup label="Buying signals" values={plan.criteria.signals} />
            <PlanGroup label="Sources" values={plan.sources} />
          </div>
          {Boolean(plan.clarifications?.length) && <div className="plan-clarifications"><div className="field-label"><HelpCircle /> Worth confirming</div><ul>{plan.clarifications!.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          {!candidates.length && <button className="button primary" onClick={runResearch} disabled={Boolean(busy)}><Search />{busy === "research" ? `Researching ${researchCount} companies across job boards and news…` : "Approve and find accounts"}</button>}
          {busy === "research" && <p className="meta research-progress">Checking live Greenhouse and Lever boards and recent Google News headlines. This takes up to a minute.</p>}
        </div>
        {candidates.length > 0 && <div className="candidate-section">
          <div className="candidate-heading"><div><h2>{candidates.length} accounts found</h2><p>Ranked by ICP fit (60%) and evidence that the timing may be right (40%).</p>{stats && !isDemo && <p className="meta lead-stats">Scanned {stats.scanned} · enriched {stats.enriched} · {stats.liveEvidence} with live evidence{stats.stale ? ` · ${stats.stale} from cache` : ""}</p>}</div><div className="candidate-actions">{plan && <button className="button" onClick={runResearch} disabled={Boolean(busy)}>{busy === "research" ? "Researching…" : "Re-run"}</button>}<a className="button" href="/leads">Open lead workspace <ArrowRight /></a></div></div>
          <div className="candidate-grid">{candidates.slice(0, 6).map((candidate) => <CandidateCard candidate={candidate} onPromote={promote} key={candidate.id} />)}</div>
          {candidates.length > 6 && <RankedList candidates={candidates.slice(6)} offset={6} onPromote={promote} />}
        </div>}
      </>}
      {error && <p className="error">{error}</p>}
    </main>
  </div>;
}

function PlanGroup({ label, values }: { label: string; values: string[] }) { return <div><div className="field-label">{label}</div><div className="chip-row">{values.map((value) => <span className="criteria-chip" key={value}>{value}</span>)}</div></div>; }

function CandidateBadge({ candidate }: { candidate: Candidate }) {
  const provenance = candidateProvenance(candidate);
  if (provenance === "none") return <span className="badge">No live evidence</span>;
  return <ProvenanceBadge provenance={provenance} />;
}

function CandidateCard({ candidate, onPromote }: { candidate: Candidate; onPromote: (id: string) => void }) {
  const signals = candidate.evidence.filter((item) => item.kind === "SIGNAL");
  return <article className="candidate-card">
    <div className="candidate-top"><div><strong>{candidate.name}</strong><div className="meta">{candidate.industry} · {candidate.city} · {candidate.sizeBand}{candidate.fundingStage ? ` · ${candidate.fundingStage}` : ""}</div></div><div className="lead-score" title={`Fit ${candidate.fitScore} · Timing ${candidate.timingScore}`}>{candidate.overallScore}</div></div>
    <div className="confidence"><span className={`confidence-dot ${candidate.confidence.toLowerCase()}`} />{candidate.confidence.toLowerCase()} confidence · fit {candidate.fitScore} · timing {signals.length ? candidate.timingScore : "Unknown"} · <CandidateBadge candidate={candidate} /></div>
    <ul>{candidate.whyFit.slice(0, 2).map((reason) => <li key={reason}><Check />{reason}</li>)}</ul>
    <div className="signal-proof"><div className="field-label">Why now</div><EvidenceList evidence={signals.length ? signals : candidate.evidence} limit={2} /></div>
    <div className="candidate-footer"><span>Suggested: <strong>{candidate.suggestedPersona}</strong></span><button className="button primary" onClick={() => onPromote(candidate.id)}>Shortlist <ArrowRight /></button></div>
  </article>;
}

function RankedList({ candidates, offset, onPromote }: { candidates: Candidate[]; offset: number; onPromote: (id: string) => void }) {
  return <div className="lead-ranked"><div className="field-label">More ranked accounts</div><div className="lead-table-wrap"><table className="lead-ranked-table"><thead><tr><th>#</th><th>Account</th><th>Fit</th><th>Timing</th><th>Overall</th><th>Top evidence</th><th></th></tr></thead><tbody>{candidates.map((candidate, index) => {
    const top = candidate.evidence.find((item) => item.kind === "SIGNAL") ?? candidate.evidence[0];
    return <tr key={candidate.id}><td className="meta">{offset + index + 1}</td><td><strong>{candidate.name}</strong><div className="meta">{candidate.industry} · {candidate.city} · {candidate.sizeBand}</div></td><td>{candidate.fitScore}</td><td>{candidate.evidence.some((item) => item.kind === "SIGNAL") ? candidate.timingScore : "Unknown"}</td><td><span className="mini-score">{candidate.overallScore}</span></td>
      <td>{top ? <>{top.sourceUrl ? <a href={top.sourceUrl} target="_blank" rel="noreferrer">{top.title}</a> : top.title}<div className="meta">{top.sourceName} · <ProvenanceBadge provenance={top.provenance} /></div></> : <span className="meta">Unknown</span>}</td>
      <td><button className="button" onClick={() => onPromote(candidate.id)}>Shortlist</button></td></tr>;
  })}</tbody></table></div></div>;
}
