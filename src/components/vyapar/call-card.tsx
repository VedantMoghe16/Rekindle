"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, PhoneCall } from "lucide-react";

type Turn = { who: string; role: string; text: string; en: string | null; language: string | null };

const OUTCOME: Record<string, { label: string; cls: string }> = {
  sample_requested: { label: "Wants a sample", cls: "b-green" },
  interested: { label: "Interested", cls: "b-cyan" },
  objection: { label: "Objection", cls: "b-amber" },
  callback: { label: "Call back", cls: "b-cyan" },
  not_interested: { label: "Not interested", cls: "b-grey" },
};

/** One AI call: the summary is what you read; the exact transcript (as spoken) opens on request. */
export function CallCard({ text, meta, time, ownerFirst }: { text: string; meta: Record<string, unknown>; time: string; ownerFirst: string }) {
  const [open, setOpen] = useState(false);
  const [english, setEnglish] = useState(false);
  // Older call messages kept the transcript inside the text, after a blank line.
  const legacy = !meta.summary && text.includes("\n\n");
  const summary = typeof meta.summary === "string" ? meta.summary : legacy ? text.split("\n\n")[0].replace(/^📞\s*/, "") : text.replace(/^📞\s*/, "");
  const turns: Turn[] = Array.isArray(meta.transcript) ? (meta.transcript as Turn[])
    : legacy ? text.split("\n\n").slice(1).join("\n").split("\n").filter(Boolean).map((l) => { const [who, ...rest] = l.split(": "); return { who, role: who === "Priya" ? "agent" : "user", text: rest.join(": "), en: null, language: null }; })
    : [];
  const outcome = OUTCOME[String(meta.outcome ?? "")];
  const quote = typeof meta.objection_quote === "string" && meta.objection_quote ? meta.objection_quote : null;
  const nextStep = typeof meta.nextStep === "string" && meta.nextStep ? meta.nextStep : null;
  const duration = typeof meta.duration === "number" ? `${Math.floor(meta.duration / 60)}:${String(Math.round(meta.duration % 60)).padStart(2, "0")}` : null;
  const languages = [...new Set(turns.map((t) => t.language).filter(Boolean))] as string[];
  const hasEnglish = turns.some((t) => t.en);

  return <div className="call-card">
    <div className="h">
      <span className="ic"><PhoneCall size={15} /></span>
      <div className="grow"><b>AI call with {ownerFirst}</b><small>{time}{duration ? ` · ${duration} min` : ""}{meta.simulated ? " · simulated" : " · Sarvam voice agent"}</small></div>
      {outcome && <span className={`badge ${outcome.cls}`}>{outcome.label}</span>}
    </div>
    <p className="sum">{summary}</p>
    {quote && <q>{quote}</q>}
    {nextStep && <div className="next"><b>Next:</b> {nextStep}</div>}
    {turns.length > 0 && <>
      <button className="more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{open ? "Hide transcript" : "Read full transcript"}
        {!open && languages.length > 0 && <span className="xs muted">· {languages.join(", ")}</span>}
      </button>
      {open && <div className="transcript" data-no-translate>
        {hasEnglish && <div className="row" style={{ justifyContent: "flex-end" }}><button className="link-btn" onClick={() => setEnglish((e) => !e)}>{english ? "Show as spoken" : "Show in English"}</button></div>}
        {turns.map((t, i) => <div key={i} className={`turn ${t.role === "agent" ? "agent" : "user"}`}><b>{t.who}</b><span>{english && t.en ? t.en : t.text}</span></div>)}
      </div>}
    </>}
  </div>;
}
