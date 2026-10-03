"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LoaderCircle, Sparkles } from "lucide-react";
import { ProviderTag } from "@/components/paytm/ui";
import { toast } from "@/components/paytm/toast";

type Q = { key: string; label: string; placeholder: string };
type Brief = { summary: string; idealCustomers: string[]; salesNeeds: string[]; keyOffers: string[]; huntPrompt: string; pitchAngle: string };

export function OnboardingForm({ questions, initial, brief: initialBrief, provider: initialProvider, saved }: { questions: readonly Q[]; initial: Record<string, string>; brief: Brief; provider: string; saved: boolean }) {
  const [answers, setAnswers] = useState(initial);
  const [brief, setBrief] = useState<Brief | null>(saved ? initialBrief : null);
  const [provider, setProvider] = useState(initialProvider);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function save() {
    setBusy(true);
    const res = await fetch("/api/vyapar/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) { setBrief(res.data.brief); setProvider(res.data.provider); toast("Saved. Your AI team now knows your business"); router.refresh(); }
    else toast("Couldn't save. Try again");
  }
  return <>
    <div className="card stack" style={{ gap: 12 }}>
      <div className="row"><Bot size={18} color="var(--pt-cyan-600)" /><b className="grow" style={{ color: "var(--pt-navy)" }}>Tell your AI team about your business</b></div>
      <span className="small muted">Answer in your own words (English or Hinglish). Edit anything any time.</span>
      {questions.map((q, i) => <label key={q.key} className="onb-q"><span><b>{i + 1}.</b> {q.label}</span><textarea rows={2} value={answers[q.key] ?? ""} placeholder={q.placeholder} onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))} /></label>)}
      <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Sparkles />}Save &amp; brief my AI team</button>
    </div>
    {brief && <div className="card stack rise" style={{ gap: 8 }}>
      <div className="card-title">What your AI team understood <ProviderTag provider={provider} /></div>
      <p className="small">{brief.summary}</p>
      <div className="brief-grid">
        <div><small>Ideal customers</small>{brief.idealCustomers.map((x) => <span key={x} className="badge b-cyan">{x}</span>)}</div>
        <div><small>Offers it can use</small>{brief.keyOffers.map((x) => <span key={x} className="badge b-amber">{x}</span>)}</div>
      </div>
      <div><small className="muted xs" style={{ textTransform: "uppercase", letterSpacing: ".05em" }}>What it will do for you</small><ul className="brief-list">{brief.salesNeeds.map((x) => <li key={x}>{x}</li>)}</ul></div>
      <div className="xs muted">Search it will run: &ldquo;{brief.huntPrompt}&rdquo;</div>
    </div>}
  </>;
}
