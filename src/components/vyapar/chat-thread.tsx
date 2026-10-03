"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Brain, CalendarDays, CheckCheck, ChevronLeft, Clock, LoaderCircle, Lock, Send, Sparkles, Truck, Workflow, CircleCheck } from "lucide-react";
import { Avatar, ProviderTag } from "@/components/paytm/ui";
import { toast } from "@/components/paytm/toast";
import { VoiceNote } from "@/components/vyapar/voice";
import { CallPanel } from "@/components/vyapar/call-panel";
import { CallCard } from "@/components/vyapar/call-card";
import { LanguageButton } from "@/components/paytm/translator";
import { OBJECTION_LABELS, STAGE_LABELS, type Objection, type Stage } from "@/lib/vyapar/taxonomy";

export type ThreadItem =
  | { type: "message"; id: string; at: string; direction: string; kind: string; text: string; author: string; provider: string | null; meta: Record<string, unknown> }
  | { type: "memory"; id: string; at: string; kind: string; category: string | null; summary: string; quote: string | null; verified: boolean }
  | { type: "action"; id: string; at: string; actionType: string; status: string; summary: string; ref: string | null; provider: string; lines: string[] };

type Props = {
  dealId: string;
  merchant: { id: string; name: string; ownerName: string };
  stage: string;
  autopilot: boolean;
  items: ThreadItem[];
  demoReplies: string[];
  playLabels: Record<string, string>;
  memoryProvider: "cognee" | "local";
  agentName: string;
};

type Suggestion = { play: string; label: string; text: string };

const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const day = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
const ACTION_ICON: Record<string, typeof Truck> = { SAMPLE_DISPATCH: Truck, MEETING: CalendarDays, PAYMENT_LINK: CircleCheck, FOLLOW_UP: Clock };

export function ChatThread({ dealId, merchant, stage, autopilot: initialAutopilot, items, demoReplies, playLabels, memoryProvider, agentName }: Props) {
  const router = useRouter();
  const [autopilot, setAutopilot] = useState(initialAutopilot);
  const [callOpen, setCallOpen] = useState(false);
  const [mode, setMode] = useState<"buyer" | "me">("buyer");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<{ text: string; as: "buyer" | "me" } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const known = useRef(new Set(items.map((i) => i.id)));
  const [fresh, setFresh] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const firstName = merchant.ownerName.trim().split(/\s+/)[0] || "the owner";
  const dialing = items.find((i): i is Extract<ThreadItem, { type: "action" }> => i.type === "action" && i.actionType === "AI_CALL" && i.status === "dialing");

  // Live call: poll until the Sarvam webhook (or the Analytics fallback) records the result, then refresh.
  useEffect(() => {
    if (!dialing?.ref) return;
    const ref = dialing.ref;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/vyapar/calls/${ref}`).then((r) => r.json()).catch(() => null);
      // Refresh every tick: mid-call tools (objection, sample, follow-up, Telegram) appear while the call is live.
      router.refresh();
      if (res?.ok && res.data.status !== "dialing") clearInterval(timer);
    }, 5000);
    return () => clearInterval(timer);
  }, [dialing?.ref, router]);

  // Items that arrive after a refresh animate in one after another (memory → counter → action).
  useEffect(() => {
    const added = items.filter((i) => !known.current.has(i.id)).map((i) => i.id);
    added.forEach((id) => known.current.add(id));
    if (added.length) {
      setFresh(added);
      setPending(null);
      setThinking(false);
    }
  }, [items]);

  useLayoutEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    const timers = fresh.map((_, i) => setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 750 * i + 120));
    return () => timers.forEach(clearTimeout);
  }, [fresh, pending, thinking]);

  async function submit(text: string, as: "buyer" | "me" = mode) {
    const value = text.trim();
    if (!value) return;
    setInput("");
    setSuggestion(null);
    setPending({ text: value, as });
    setThinking(true);
    const url = as === "buyer" ? `/api/vyapar/deals/${dealId}/reply` : `/api/vyapar/deals/${dealId}/message`;
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: value }) }).then((r) => r.json()).catch(() => null);
    if (!res?.ok) {
      setPending(null);
      setThinking(false);
      return toast(res?.error?.message ?? "Couldn't send that");
    }
    if (as === "buyer") {
      const stageEvent = (res.data.events as { kind: string; to?: string }[]).find((e) => e.kind === "stage");
      if (!res.data.sent) setSuggestion(res.data.suggestion);
      setTimeout(() => toast(stageEvent?.to ? `Deal stage → ${stageEvent.to}` : res.data.sent ? "Autopilot replied" : "Suggested reply ready for you"), 900);
    }
    router.refresh();
  }

  async function approve(s: Suggestion) {
    setSuggestion(null);
    setPending({ text: s.text, as: "me" });
    const res = await fetch(`/api/vyapar/deals/${dealId}/message`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: s.text, play: s.play }) }).then((r) => r.json()).catch(() => null);
    if (!res?.ok) { setPending(null); return toast("Couldn't send"); }
    router.refresh();
  }

  async function toggleAutopilot() {
    const next = !autopilot;
    setAutopilot(next);
    await fetch(`/api/vyapar/deals/${dealId}/message`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ autopilot: next }) });
    toast(next ? "Autopilot on: AI replies, you approve deals" : "Autopilot off: AI suggests, you send");
  }

  const delay = (id: string) => {
    const i = fresh.indexOf(id);
    return i < 0 ? undefined : { animationDelay: `${i * 750}ms` };
  };
  let lastDay = "";

  return <div className="page">
    <header className="chat-head">
      <Link className="icon-btn" href="/vyapar/deals" aria-label="Back"><ChevronLeft /></Link>
      <Avatar name={merchant.name} round />
      <div className="grow" style={{ minWidth: 0 }}><b>{merchant.name}</b><small>{thinking && pending?.as === "buyer" ? "Vyapar AI is reading…" : "via Vyapar AI · Paytm verified"}</small></div>
      <button className="icon-btn" onClick={() => setCallOpen((o) => !o)} aria-label="AI call"><Phone /></button>
      <Link className="icon-btn" href={`/vyapar/merchants/${merchant.id}`} aria-label="Merchant memory"><Brain /></Link>
      <LanguageButton />
    </header>
    {callOpen && <CallPanel dealId={dealId} onClose={() => setCallOpen(false)} />}
    {dialing && <div className="call-live"><span className="pulse-dot" /><b className="grow">{agentName} is on the call with {firstName}…</b><span className="xs muted">result appears here</span></div>}
    <div className="autopilot">
      <Sparkles size={18} color="var(--pt-cyan)" />
      <span><b>Autopilot</b> {autopilot ? "· AI replies for you" : "· off, AI suggests"}</span>
      <button className={`switch${autopilot ? "" : " off"}`} onClick={toggleAutopilot} aria-label="Toggle autopilot" aria-pressed={autopilot} />
      <span className={`badge stage-pill ${stage === "ORDER_WON" ? "b-green" : stage === "OBJECTION" ? "b-amber" : stage === "LOST" ? "b-grey" : "b-cyan"}`}>{STAGE_LABELS[stage as Stage] ?? stage}</span>
    </div>

    <div className="thread" aria-live="polite">
      <span className="daychip secure"><Lock size={11} style={{ verticalAlign: -1 }} /> Business chat via Paytm Vyapar AI. {firstName} sees your Paytm-verified business name</span>
      {items.map((item) => {
        const d = day(item.at);
        const chip = d !== lastDay ? <span className="daychip" key={`d-${d}`}>{d}</span> : null;
        lastDay = d;
        const cls = fresh.includes(item.id) ? " enter" : "";
        if (item.type === "message" && item.kind === "call") {
          return [chip, <div key={item.id} className={`call-wrap${cls}`} style={delay(item.id)}><CallCard text={item.text} meta={item.meta} time={time(item.at)} ownerFirst={firstName} /></div>];
        }
        if (item.type === "message") {
          const play = typeof item.meta.play === "string" ? item.meta.play : null;
          return [chip,
            play && item.direction === "out" && <div key={`${item.id}-play`} className={`sys-card${cls}`} style={delay(item.id)}>
              <div className="h"><Sparkles />Counter-offer chosen<span className="tag paytm">Growth loop</span></div>
              <div><b style={{ color: "var(--pt-navy)" }}>✓ {playLabels[play] ?? play}</b> <span className="muted">· {String(item.meta.winRate ?? "")}% in demo benchmark</span></div>
            </div>,
            <div key={item.id} className={`bubble ${item.direction}${item.kind === "voice" ? " voice-b" : ""}${cls}`} style={delay(item.id)}>
              {item.direction === "out" && <span className="via">{item.author}{item.provider && item.provider !== "human" ? ` · ${item.provider === "sarvam-tts" ? "Sarvam voice" : item.provider}` : ""}</span>}
              {item.kind === "voice" ? <VoiceNote text={item.text} compact /> : item.text}
              <span className="t">{time(item.at)}{item.direction === "out" && <CheckCheck />}</span>
            </div>];
        }
        if (item.type === "memory") {
          const title = item.kind === "OBJECTION" ? "Objection saved to memory" : item.kind === "TIMING" ? "Timing remembered" : "Preference noted";
          return [chip, <div key={item.id} className={`sys-card mem${cls}`} style={delay(item.id)}>
            <div className="h"><Brain />{title}<ProviderTag provider={memoryProvider} /></div>
            {item.quote && <q>{item.quote}</q>}
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              {item.category && <span className="badge b-red">{OBJECTION_LABELS[item.category as Objection] ?? item.category}</span>}
              {item.kind !== "OBJECTION" && <span className="small">{item.summary}</span>}
              {item.verified && <span className="badge b-green">Quote verified</span>}
            </div>
          </div>];
        }
        const Icon = ACTION_ICON[item.actionType] ?? Workflow;
        return [chip, <div key={item.id} className={`sys-card act${cls}`} style={delay(item.id)}>
          <div className="h"><Workflow />{item.summary.split(" · ")[0]}<ProviderTag provider={item.provider} /></div>
          {(item.lines.length ? item.lines : [item.summary.split(" · ").slice(1).join(" · ")]).map((l) => <div className="line" key={l}><Icon />{l}</div>)}
          <div className="xs muted">Task {item.ref} · {item.status}</div>
        </div>];
      })}
      {pending && <div className={`bubble ${pending.as === "buyer" ? "in" : "out"} enter`}>{pending.text}<span className="t">now</span></div>}
      {thinking && pending?.as === "buyer" && <div className="typing out" aria-label="Vyapar AI is working"><i /><i /><i /></div>}
      {suggestion && <div className="suggest-card enter">
        <div className="row"><Sparkles size={16} color="var(--pt-cyan-600)" /><b className="grow" style={{ color: "var(--pt-navy)" }}>Suggested reply · {suggestion.label}</b></div>
        <div>{suggestion.text}</div>
        <div className="row"><button className="btn btn-ghost btn-sm" onClick={() => { setMode("me"); setInput(suggestion.text); setSuggestion(null); }}>Edit</button><button className="btn btn-primary btn-sm grow" onClick={() => approve(suggestion)}><Send />Send</button></div>
      </div>}
      <div ref={end} />
    </div>

    <div className="composer">
      <div className="who" role="group" aria-label="Who is typing">
        <button className={mode === "buyer" ? "on" : ""} onClick={() => setMode("buyer")}>Reply as {firstName} (demo)</button>
        <button className={mode === "me" ? "on" : ""} onClick={() => setMode("me")}>Send as you</button>
      </div>
      {mode === "buyer" && demoReplies.length > 0 && <div className="chips">{demoReplies.map((r) => <button key={r} onClick={() => submit(r, "buyer")} disabled={thinking} title={r}>{r}</button>)}</div>}
      <form className="bar" onSubmit={(e) => { e.preventDefault(); submit(input); }}>
        <div className="field"><input value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "buyer" ? `Type ${firstName}'s reply…` : "Type a message"} aria-label="Message" /></div>
        <button className="send" type="submit" disabled={thinking} aria-label="Send">{thinking ? <LoaderCircle className="spin" /> : <Send />}</button>
      </form>
    </div>
  </div>;
}
