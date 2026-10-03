"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Brain, CircleHelp, Handshake, Search, X } from "lucide-react";

const KEY = "vyapar-intro-seen";
const STEPS = [
  { Icon: Search, title: "Find", text: "Say or type who you want to sell to, like “bakeries within 3 km”. Vyapar AI finds nearby shops and tells you why each one fits." },
  { Icon: Bot, title: "AI team", text: "Tap Start on the results. Your AI team sends each shop a Telegram pitch, then calls them one by one at their quietest hour." },
  { Icon: Handshake, title: "Deals", text: "Every conversation, call summary and sample in one place. The follow-up agent nudges quiet leads, with your OK." },
  { Icon: Brain, title: "Memory", text: "Everything buyers said is remembered, so the next pitch and call pick up where the last one left off." },
];

/** First-time brief for Vyapar AI (shown once; the ? button reopens it). */
export function VyaparIntro() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setOpen(true); } catch { /* storage blocked: skip the intro */ }
  }, []);
  function close() {
    setOpen(false);
    setI(0);
    try { localStorage.setItem(KEY, "1"); } catch { /* fine */ }
  }
  const step = STEPS[i];
  return <>
    <button className="icon-btn" onClick={() => setOpen(true)} aria-label="What can Vyapar AI do?"><CircleHelp /></button>
    {open && createPortal(<div className="sheet-backdrop intro-backdrop" onClick={close}>
      <div className="intro-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="What Vyapar AI does">
        <button className="icon-btn intro-x" onClick={close} aria-label="Close"><X size={18} /></button>
        <span className="intro-ic"><step.Icon /></span>
        <small className="muted">Vyapar AI · {i + 1} of {STEPS.length}</small>
        <b>{step.title}</b>
        <p>{step.text}</p>
        <div className="intro-dots">{STEPS.map((s, j) => <i key={s.title} className={j === i ? "on" : ""} />)}</div>
        <div className="row" style={{ gap: 8, width: "100%" }}>
          {i > 0 ? <button className="btn btn-ghost grow" onClick={() => setI(i - 1)}>Back</button> : <button className="btn btn-ghost grow" onClick={close}>Skip</button>}
          <button className="btn btn-primary grow" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : close())}>{i < STEPS.length - 1 ? "Next" : "Get started"}</button>
        </div>
      </div>
    </div>, document.querySelector(".device") ?? document.body)}
  </>;
}
