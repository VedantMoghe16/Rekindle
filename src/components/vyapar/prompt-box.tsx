"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Mic, Send } from "lucide-react";
import { toast } from "@/components/paytm/toast";

const SUGGESTIONS = [
  "Find me cloud kitchens and bakeries within a 5km radius and pitch my ₹5 paper bags.",
  "Diwali ke liye 3 km mein mithai ki dukaan dhundo",
  "Cafes that are newly opened or growing near me",
  "Restaurants rated 4 star+ within 4 km",
];

type SpeechRecognitionLike = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function PromptBox({ initial = SUGGESTIONS[0] }: { initial?: string }) {
  const [text, setText] = useState(initial);
  const [lang, setLang] = useState<"hinglish" | "english" | "hindi">("hinglish");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const router = useRouter();

  async function run(prompt = text) {
    if (prompt.trim().length < 4) return toast("Tell me what you sell and who to find");
    setBusy(true);
    const suffix = lang === "english" ? " Pitch in English." : lang === "hindi" ? " Pitch in Hindi." : "";
    const res = await fetch("/api/vyapar/hunts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: prompt + suffix }) }).then((r) => r.json()).catch(() => null);
    if (res?.ok) router.push(`/vyapar/hunts/${res.data.huntId}?new=1`);
    else { setBusy(false); toast(res?.error?.message ?? "Couldn't start the search"); }
  }

  function mic() {
    const Ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Ctor) return toast("Voice input needs Chrome. Type your request instead");
    if (listening) return rec.current?.stop();
    const r = new Ctor();
    r.lang = "hi-IN";
    r.interimResults = true;
    r.onresult = (e) => setText(Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); toast("Couldn't hear that. Try again"); };
    rec.current = r;
    setListening(true);
    r.start();
  }

  return <>
    <div className="prompt-box">
      <textarea aria-label="What do you want to sell, and to whom?" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } }} />
      <div className="tools">
        <div className="seg-mini" role="group" aria-label="Pitch language">
          {(["hinglish", "english", "hindi"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l === "hinglish" ? "Hinglish" : l === "english" ? "EN" : "हिं"}</button>)}
        </div>
        <button className={`round-btn${listening ? " rec" : ""}`} onClick={mic} aria-label={listening ? "Stop listening" : "Speak your request"}><Mic /></button>
        <button className="round-btn go" onClick={() => run()} disabled={busy} aria-label="Find buyers">{busy ? <LoaderCircle className="spin" /> : <Send />}</button>
      </div>
    </div>
    <div className="suggests" style={{ padding: "12px 0 0" }}>
      {SUGGESTIONS.slice(1).map((s) => <button key={s} onClick={() => { setText(s); run(s); }} disabled={busy}>{s}</button>)}
    </div>
  </>;
}
