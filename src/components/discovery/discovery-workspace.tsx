"use client";

import { useState } from "react";
import { ArrowRight, Check, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

type Criteria = { geographies: string[]; industries: string[]; cities: string[]; employeeMin: number; employeeMax: number; fundingStages: string[]; personas: string[]; signals: string[]; exclusions: string[] };
type Plan = { criteria: Criteria; summary: string; productProfile: { name: string; product: string; capabilities: string[]; proofPoints: string[] }; sources: string[] };
type Candidate = { id: string; name: string; industry: string; city: string; sizeBand: string; overallScore: number; fitScore: number; timingScore: number; confidence: string; suggestedPersona: string; whyFit: string[]; evidence: { id: string; kind: string; title: string; excerpt: string; sourceName: string }[] };

const sample = "We automate SOC 2 and ISO 27001 for Indian SaaS companies. Find Series A–C companies with 50–500 employees that sell to enterprises and are hiring security, platform or compliance roles. Target CTOs and Heads of Security.";

export function DiscoveryWorkspace() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(sample);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([{ role: "assistant", text: "Tell me what you sell and who gets the most value. I’ll turn it into a research plan before searching." }]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function createPlan() {
    setBusy(true); setError("");
    const response = await fetch("/api/discovery/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
    const body = await response.json(); setBusy(false);
    if (!body.ok) { setError(body.error.message); return; }
    setMessages((old) => [...old, { role: "user", text: prompt }, { role: "assistant", text: `I turned that into a research plan. Review the criteria, then run the search.` }]);
    setPlan(body.data); setCandidates([]);
  }
  async function runResearch() {
    if (!plan) return; setBusy(true); setError("");
    const response = await fetch("/api/discovery/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, criteria: plan.criteria }) });
    const body = await response.json(); setBusy(false);
    if (!body.ok) { setError(body.error.message); return; }
    setCandidates(body.data.candidates);
    setMessages((old) => [...old, { role: "assistant", text: `Research complete. I found ${body.data.candidates.length} accounts with supporting evidence. These are demo companies.` }]);
  }
  async function promote(id: string) {
    const body = await fetch(`/api/leads/${id}/promote`, { method: "POST" }).then((r) => r.json());
    if (body.ok) router.push(`/accounts/${body.data.accountId}`); else setError(body.error.message);
  }
  return <div className="discovery-layout">
    <section className="chat-panel">
      <div className="chat-title"><span className="assistant-mark"><Sparkles /></span><div><strong>Find accounts</strong><div className="meta">Conversational research · Demo data</div></div></div>
      <div className="messages">{messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}>{message.text}</div>)}</div>
      <div className="composer"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Describe your target accounts" /><button onClick={createPlan} disabled={busy || prompt.trim().length < 4}>{busy ? "Working…" : <><ArrowRight /> Build plan</>}</button></div>
      {candidates.length > 0 && <div className="refine-hint">Try a refinement: “Only Bengaluru and Mumbai” or “show companies with a new security leader.”</div>}
    </section>
    <main className="research-pane">
      {!plan && <div className="research-empty"><Search /><h2>Describe the market in your own words</h2><p>Rekindle will expose the exact filters, signals and sources before it researches accounts.</p></div>}
      {plan && <>
        <div className="plan-card">
          <div className="plan-head"><div><span className="eyebrow">Research plan</span><h2>{plan.summary}</h2></div><span className="badge demo">Demo research</span></div>
          <div className="plan-grid">
            <PlanGroup label="Industries" values={plan.criteria.industries} />
            <PlanGroup label="Location" values={plan.criteria.cities.length ? plan.criteria.cities : plan.criteria.geographies} />
            <PlanGroup label="Company" values={[`${plan.criteria.employeeMin}–${plan.criteria.employeeMax} employees`, ...plan.criteria.fundingStages]} />
            <PlanGroup label="Personas" values={plan.criteria.personas} />
            <PlanGroup label="Buying signals" values={plan.criteria.signals} />
            <PlanGroup label="Sources" values={plan.sources} />
          </div>
          {!candidates.length && <button className="button primary" onClick={runResearch} disabled={busy}><Search />{busy ? "Researching sources…" : "Approve and find accounts"}</button>}
        </div>
        {candidates.length > 0 && <div className="candidate-section"><div className="candidate-heading"><div><h2>{candidates.length} accounts found</h2><p>Ranked by ICP fit and evidence that the timing may be right.</p></div><a className="button" href="/leads">Open lead workspace <ArrowRight /></a></div><div className="candidate-grid">{candidates.slice(0, 6).map((candidate) => <CandidateCard candidate={candidate} onPromote={promote} key={candidate.id} />)}</div></div>}
      </>}
      {error && <p className="error">{error}</p>}
    </main>
  </div>;
}

function PlanGroup({ label, values }: { label: string; values: string[] }) { return <div><div className="field-label">{label}</div><div className="chip-row">{values.map((value) => <span className="criteria-chip" key={value}>{value}</span>)}</div></div>; }

function CandidateCard({ candidate, onPromote }: { candidate: Candidate; onPromote: (id: string) => void }) {
  const signal = candidate.evidence.find((item) => item.kind === "SIGNAL");
  return <article className="candidate-card"><div className="candidate-top"><div><strong>{candidate.name}</strong><div className="meta">{candidate.industry} · {candidate.city} · {candidate.sizeBand}</div></div><div className="lead-score">{candidate.overallScore}</div></div><div className="confidence"><span className={`confidence-dot ${candidate.confidence.toLowerCase()}`} />{candidate.confidence.toLowerCase()} confidence · <span className="badge demo">Demo data</span></div><ul>{candidate.whyFit.slice(0, 2).map((reason) => <li key={reason}><Check />{reason}</li>)}</ul>{signal && <div className="signal-proof"><div className="field-label">Why now</div><strong>{signal.title}</strong><p>{signal.excerpt}</p></div>}<div className="candidate-footer"><span>Suggested: <strong>{candidate.suggestedPersona}</strong></span><button className="button primary" onClick={() => onPromote(candidate.id)}>Shortlist <ArrowRight /></button></div></article>;
}
