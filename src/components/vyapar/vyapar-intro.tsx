"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Brain, CircleHelp, Handshake, LoaderCircle, Phone, Search, X } from "lucide-react";

const KEY = "vyapar-intro-seen";
const PHONE_KEY = "vyapar-demo-phone";
const STEPS = [
  { Icon: Search, title: "Find", text: "Say or type who you want to sell to, like “bakeries within 3 km”. Vyapar AI finds nearby shops and tells you why each one fits." },
  { Icon: Bot, title: "AI team", text: "Tap Start on the results. Your AI team sends each shop a Telegram pitch, then calls them one by one at their quietest hour." },
  { Icon: Handshake, title: "Deals", text: "Every conversation, call summary and sample in one place. The follow-up agent nudges quiet leads, with your OK." },
  { Icon: Brain, title: "Memory", text: "Everything buyers said is remembered, so the next pitch and call pick up where the last one left off." },
];

const savePhone = (phone: string) => fetch("/api/vyapar/demo/phone", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone }) }).then((r) => r.json()).catch(() => null);

/** First-time brief for Vyapar AI (shown once; the ? button reopens it). Starts by asking for the visitor's phone, which demo AI calls ring. */
export function VyaparIntro() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [askPhone, setAskPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PHONE_KEY);
      // The demo is shared, so re-claim the calls for this visitor's number whenever they come back.
      if (saved) savePhone(saved);
      else setAskPhone(true);
      if (!localStorage.getItem(KEY) || !saved) setOpen(true);
    } catch { /* storage blocked: skip the intro */ }
  }, []);
  async function submitPhone() {
    setSaving(true);
    const res = await savePhone(phone);
    setSaving(false);
    if (!res?.ok) return setPhoneError(res?.error?.message ?? "Couldn't save. Try again");
    try { localStorage.setItem(PHONE_KEY, res.data.phone); } catch { /* fine */ }
    setAskPhone(false);
    try { if (localStorage.getItem(KEY)) setOpen(false); } catch { /* fine */ }
  }
  function close() {
    setOpen(false);
    setI(0);
    try { localStorage.setItem(KEY, "1"); } catch { /* fine */ }
  }
  const step = STEPS[i];
  const phoneCard = <div className="intro-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Your phone number">
    <button className="icon-btn intro-x" onClick={close} aria-label="Close"><X size={18} /></button>
    <span className="intro-ic"><Phone /></span>
    <small className="muted">Vyapar AI · Before we start</small>
    <b>Your phone number</b>
    <p>The shops in this demo are made up, so when your AI sales team calls a shop, it rings you instead. Enter a number you can pick up.</p>
    <form className="intro-phone" onSubmit={(e) => { e.preventDefault(); submitPhone(); }}>
      <input type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" aria-label="Your phone number" value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneError(null); }} autoFocus />
      {phoneError && <small className="intro-err">{phoneError}</small>}
      <div className="row" style={{ gap: 8, width: "100%" }}>
        <button type="button" className="btn btn-ghost grow" onClick={() => setAskPhone(false)}>Skip</button>
        <button type="submit" className="btn btn-primary grow" disabled={saving || phone.trim().length < 10}>{saving ? <LoaderCircle className="spin" /> : "Continue"}</button>
      </div>
    </form>
  </div>;
  return <>
    <button className="icon-btn" onClick={() => setOpen(true)} aria-label="What can Vyapar AI do?"><CircleHelp /></button>
    {open && createPortal(<div className="sheet-backdrop intro-backdrop" onClick={close}>
      {askPhone ? phoneCard : <div className="intro-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="What Vyapar AI does">
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
      </div>}
    </div>, document.querySelector(".device") ?? document.body)}
  </>;
}
