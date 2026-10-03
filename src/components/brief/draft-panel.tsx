"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw, Send, Sparkles } from "lucide-react";

type Draft = { id: string; channel: string; language: string; subject: string | null; body: string; why: string[]; provenance: string; violations: string[] };
type Channel = "whatsapp" | "email";

const PROVENANCE: Record<string, string> = { claude: "Claude", sarvam: "Sarvam", cached: "Cached", template: "Template" };

export function defaultDraftChannel(lastChannel: string | null | undefined): Channel {
  return lastChannel === "email" ? "email" : "whatsapp";
}

export function DraftPanel({ recommendationId, dealId, defaultChannel = "whatsapp", autoGenerate = false }: { recommendationId?: string | null; dealId?: string; defaultChannel?: Channel; autoGenerate?: boolean }) {
  const router = useRouter();
  const [recId, setRecId] = useState<string | null>(recommendationId ?? null);
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [language, setLanguage] = useState<"en" | "hinglish">("en");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const started = useRef(false);

  async function ensureRec(): Promise<string | null> {
    if (recId) return recId;
    if (!dealId) return null;
    const response = await fetch("/api/recommendations/nudge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dealId }) }).then((r) => r.json());
    if (!response.ok) { setError(response.error.message); return null; }
    setRecId(response.data.id);
    return response.data.id;
  }

  async function generate(nextChannel = channel, nextLanguage = language) {
    setBusy("Writing draft…"); setError(""); setSent(false);
    try {
      const id = await ensureRec();
      if (!id) return;
      const response = await fetch(`/api/recommendations/${id}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel: nextChannel, language: nextChannel === "email" ? "en" : nextLanguage }) }).then((r) => r.json());
      if (!response.ok) { setError(response.error.message); return; }
      setDraft(response.data); setBody(response.data.body);
    } catch { setError("We couldn't reach the server. Try again."); }
    finally { setBusy(""); }
  }

  useEffect(() => {
    if (!autoGenerate || started.current) return;
    started.current = true;
    void (async () => {
      if (recId) {
        const existing = await fetch(`/api/recommendations/${recId}/draft`).then((r) => r.json()).catch(() => null);
        if (existing?.ok && existing.data) { setDraft(existing.data); setBody(existing.data.body); setChannel(existing.data.channel === "email" ? "email" : "whatsapp"); setLanguage(existing.data.language === "hinglish" ? "hinglish" : "en"); return; }
      }
      await generate();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate]);

  async function copy() {
    const text = draft?.subject ? `Subject: ${draft.subject}\n\n${body}` : body;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setError("Copy failed. Select the text and copy it manually."); }
  }

  async function markSent() {
    if (!recId) return;
    setBusy("Saving…");
    const response = await fetch(`/api/recommendations/${recId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sent", draftId: draft?.id, body }) }).then((r) => r.json()).catch(() => ({ ok: false, error: { message: "We couldn't reach the server." } }));
    setBusy("");
    if (!response.ok) { setError(response.error.message); return; }
    setSent(true);
    router.refresh();
  }

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const limit = channel === "whatsapp" ? 70 : 120;

  return <div className="draft-panel">
    <div className="draft-toggles">
      <div className="segmented" role="group" aria-label="Channel">
        {(["whatsapp", "email"] as const).map((value) => <button key={value} className={channel === value ? "active" : ""} onClick={() => { setChannel(value); if (draft) void generate(value, language); }}>{value === "whatsapp" ? "WhatsApp" : "Email"}</button>)}
      </div>
      <div className="segmented" role="group" aria-label="Language">
        {(["en", "hinglish"] as const).map((value) => <button key={value} disabled={channel === "email" && value === "hinglish"} className={(channel === "email" ? "en" : language) === value ? "active" : ""} onClick={() => { setLanguage(value); if (draft && channel === "whatsapp") void generate(channel, value); }}>{value === "en" ? "English" : "Hinglish"}</button>)}
      </div>
      {draft && <span className={`badge prov-${draft.provenance}`}>{PROVENANCE[draft.provenance] ?? draft.provenance}</span>}
    </div>
    {!draft ? <button className="button primary" disabled={Boolean(busy)} onClick={() => generate()}><Sparkles /> {busy || "Generate draft"}</button> : <>
      {draft.subject && <div className="draft-subject"><span className="field-label">Subject</span> {draft.subject}</div>}
      <textarea className="draft-body" value={body} onChange={(e) => setBody(e.target.value)} rows={channel === "email" ? 10 : 6} />
      <div className={`meta ${words > limit ? "over-limit" : ""}`}>{words}/{limit} words</div>
      {draft.why.length > 0 && <details className="draft-why" open><summary>Why this works</summary><ul>{draft.why.map((item, i) => <li key={i}>{item}</li>)}</ul></details>}
      <div className="card-actions">
        <button className="button" disabled={Boolean(busy)} onClick={() => generate()}><RefreshCw /> {busy === "Writing draft…" ? busy : "Regenerate"}</button>
        <button className="button" onClick={copy}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</button>
        <button className="button primary" disabled={Boolean(busy) || sent} onClick={markSent}><Send /> {sent ? "Marked as sent" : "Mark as sent"}</button>
      </div>
      <div className="meta">Rekindle never sends on your behalf.</div>
    </>}
    {error && <p className="error">{error}</p>}
  </div>;
}
