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

/** Find buyers by typing or speaking. Speech is transcribed by Sarvam in whatever language was spoken, then run as is. */
export function PromptBox({ initial = SUGGESTIONS[0] }: { initial?: string }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState<"idle" | "recording" | "transcribing">("idle");
  const [heard, setHeard] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  async function run(prompt = text, english?: string | null) {
    if (prompt.trim().length < 2) return toast("Tell me what you sell and who to find");
    setBusy(true);
    const res = await fetch("/api/vyapar/hunts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, english }) }).then((r) => r.json()).catch(() => null);
    if (res?.ok) router.push(`/vyapar/hunts/${res.data.huntId}?new=1`);
    else { setBusy(false); toast(res?.error?.message ?? "Couldn't start the search"); }
  }

  async function transcribe(blob: Blob) {
    setMic("transcribing");
    const form = new FormData();
    form.append("file", blob, `speech.${blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm"}`);
    const res = await fetch("/api/vyapar/listen", { method: "POST", body: form }).then((r) => r.json()).catch(() => null);
    setMic("idle");
    if (!res?.ok) return toast(res?.error?.message ?? "Couldn't hear that. Try again");
    setText(res.data.text);
    setHeard(res.data.language);
    run(res.data.text, res.data.english);
  }

  async function toggleMic() {
    if (mic === "recording") return rec.current?.stop();
    if (mic === "transcribing") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return toast("This browser can't record audio. Type your request instead");
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return toast("Allow microphone access to speak your request"); }
    const r = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (stopTimer.current) clearTimeout(stopTimer.current);
      const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
      if (blob.size < 500) { setMic("idle"); return toast("Didn't catch that. Tap the mic and speak"); }
      transcribe(blob);
    };
    rec.current = r;
    r.start();
    setHeard(null);
    setMic("recording");
    stopTimer.current = setTimeout(() => { if (r.state === "recording") r.stop(); }, 20_000);
  }

  return <>
    <div className="prompt-box">
      <textarea aria-label="What do you want to sell, and to whom?" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } }} />
      <div className="tools">
        <span className="xs muted grow" aria-live="polite">{mic === "recording" ? "Listening… speak in any language, tap again to stop" : mic === "transcribing" ? "Understanding what you said…" : heard ? `Heard in ${heard}` : "Type or tap the mic and speak"}</span>
        <button className={`round-btn${mic === "recording" ? " rec" : ""}`} onClick={toggleMic} disabled={busy || mic === "transcribing"} aria-label={mic === "recording" ? "Stop and search" : "Speak your request"}>{mic === "transcribing" ? <LoaderCircle className="spin" /> : <Mic />}</button>
        <button className="round-btn go" onClick={() => run()} disabled={busy} aria-label="Find buyers">{busy ? <LoaderCircle className="spin" /> : <Send />}</button>
      </div>
    </div>
    <div className="suggests" style={{ padding: "12px 0 0" }}>
      {SUGGESTIONS.slice(1).map((s) => <button key={s} onClick={() => { setText(s); run(s); }} disabled={busy}>{s}</button>)}
    </div>
  </>;
}
