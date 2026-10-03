"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MapPin, MessageCircle, Mic, PencilLine, Phone, RefreshCw, Send } from "lucide-react";
import { ProviderTag } from "@/components/paytm/ui";
import { toast } from "@/components/paytm/toast";
import { VoiceNote } from "@/components/vyapar/voice";

type Pitch = { text: string; highlights: string[]; why: { tag: string; text: string }[]; provider: string; angle?: string; problems?: string[]; hypothesis?: string; contact?: { status: string; name: string | null; role: string | null; note: string } };
const ANGLES: Record<string, string> = { STRONG_NEED: "Answer what they asked", EXPANSION: "Acknowledge a public event", CATEGORY_FIT: "Nearby supplier, low-commitment sample", INTRO: "Introduction / visit request" };
const CHIP: Record<string, string> = { PAYTM: "b-cyan", WEB: "b-amber", SIGNAL: "b-green", OFFER: "b-navy", PUBLIC: "b-green", BUYER: "b-red", PRIVATE: "b-grey" };

function marked(text: string, highlights: string[]) {
  const parts: React.ReactNode[] = [];
  const valid = highlights.filter((h) => h && text.includes(h)).sort((a, b) => text.indexOf(a) - text.indexOf(b));
  let cursor = 0;
  for (const h of valid) {
    const at = text.indexOf(h, cursor);
    if (at < 0) continue;
    parts.push(text.slice(cursor, at), <mark key={at}>{h}</mark>);
    cursor = at + h.length;
  }
  parts.push(text.slice(cursor));
  return parts;
}

export function PitchComposer({ leadId, initial }: { leadId: string; initial: Pitch }) {
  const [pitch, setPitch] = useState(initial);
  const [text, setText] = useState(initial.text);
  const [editing, setEditing] = useState(false);
  const [channel, setChannel] = useState<"wa" | "voice" | "call">("voice");
  const [busy, setBusy] = useState<"rewrite" | "send" | null>(null);
  const router = useRouter();
  const words = text.trim().split(/\s+/).length;
  const intro = pitch.angle === "INTRO";
  const PRIVATE = /\b(payment|payments|transaction|transactions|receipts?|revenue|turnover|qr (volume|receipts))\b/i;
  const leak = PRIVATE.test(text);

  async function rewrite() {
    setBusy("rewrite");
    const res = await fetch(`/api/vyapar/leads/${leadId}/pitch`, { method: "POST" }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (res?.ok) { setPitch(res.data); setText(res.data.text); setEditing(false); toast(res.data.provider === "template" ? "Template rewrite (connect Sarvam for AI drafts)" : "Fresh draft ready"); }
    else toast("Couldn't rewrite right now");
  }
  async function planVisit() {
    setBusy("send");
    const res = await fetch(`/api/vyapar/leads/${leadId}/visit`, { method: "POST" }).then((r) => r.json()).catch(() => null);
    if (res?.ok) { toast("Added to your visit route"); router.push("/vyapar/deals"); }
    else { setBusy(null); toast("Couldn't plan the visit"); }
  }
  async function send() {
    if (leak) return toast("Remove the payment/sales detail first: private Paytm data can't go in a pitch");
    if (channel === "call") return toast("AI calling is coming next. Sending on WhatsApp for now");
    setBusy("send");
    const res = await fetch(`/api/vyapar/leads/${leadId}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, withVoice: channel === "voice" }) }).then((r) => r.json()).catch(() => null);
    if (res?.ok) { toast("Pitch sent on WhatsApp"); router.push(`/vyapar/deals/${res.data.dealId}`); }
    else { setBusy(null); toast(res?.error?.message ?? "Couldn't send"); }
  }

  return <>
    <main className="scroll">
      <div className="pad">
        <div className="card stack" style={{ gap: 6 }}>
          {pitch.hypothesis && <div className="row"><span className="badge b-cyan">Opportunity</span><b className="small" style={{ color: "var(--pt-navy)" }}>{pitch.hypothesis}</b></div>}
          {pitch.angle && <div className="row"><span className="badge b-navy">Angle</span><span className="small">{ANGLES[pitch.angle] ?? pitch.angle}</span></div>}
          {pitch.contact && <div className="row"><span className={`badge ${pitch.contact.status === "verified" ? "b-green" : "b-amber"}`}>{pitch.contact.status === "verified" ? "Contact verified" : "Contact unknown"}</span><span className="small">{pitch.contact.status === "verified" ? `${pitch.contact.name} · ${pitch.contact.role}` : pitch.contact.note}</span></div>}
        </div>
        {!intro && <div className="seg" role="tablist" aria-label="Channel">
          <button className={channel === "wa" ? "on" : ""} onClick={() => setChannel("wa")}><MessageCircle />WhatsApp</button>
          <button className={channel === "voice" ? "on" : ""} onClick={() => setChannel("voice")}><Mic />+ Voice note</button>
          <button className={channel === "call" ? "on" : ""} onClick={() => setChannel("call")}><Phone />AI call</button>
        </div>}
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="badge b-navy">{intro ? "Visit / intro script" : "Hinglish"} · {words} words</span>
            <span className="grow" />
            <span className="xs muted">Written by</span><ProviderTag provider={pitch.provider} />
            <button className="icon-btn" onClick={() => setEditing((e) => !e)} aria-label="Edit message"><PencilLine size={18} /></button>
          </div>
          {editing ? <textarea className="draft-edit" value={text} onChange={(e) => setText(e.target.value)} aria-label="Pitch message" /> : <div className="draft">{marked(text, pitch.highlights)}</div>}
        </div>
        {leak && <div className="badge b-red" style={{ whiteSpace: "normal" }}>This mentions the buyer&apos;s payments or sales. Private Paytm data can&apos;t be used in a pitch.</div>}
        {!intro && <VoiceNote text={text} />}
        <div className="card">
          <div className="card-title">Why this pitch</div>
          <div className="evidence" style={{ marginTop: 8 }}>{pitch.why.map((w) => <div key={w.text}><span className={`chip ${CHIP[w.tag] ?? "b-grey"}`}>{w.tag}</span><span>{w.text}</span></div>)}</div>
        </div>
        <p className="xs muted" style={{ textAlign: "center" }}>{intro ? "No verified contact, so Vyapar won't message a guessed number. Visit with a sample, or ask a mutual contact for an introduction." : "You approve every first message. Sending is simulated in this prototype. Replies after this can run on Autopilot."}</p>
      </div>
    </main>
    <div className="sticky-cta">
      <button className="btn btn-ghost" style={{ flex: 1 }} onClick={rewrite} disabled={busy !== null}>{busy === "rewrite" ? <LoaderCircle className="spin" /> : <RefreshCw />}Rewrite</button>
      {intro
        ? <button className="btn btn-primary" style={{ flex: 2 }} onClick={planVisit} disabled={busy !== null}>{busy === "send" ? <LoaderCircle className="spin" /> : <MapPin />}Add to visit route</button>
        : <button className="btn btn-primary" style={{ flex: 2 }} onClick={send} disabled={busy !== null || leak}>{busy === "send" ? <LoaderCircle className="spin" /> : <Send />}Send on WhatsApp</button>}
    </div>
  </>;
}
