"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Mic } from "lucide-react";
import { toast } from "@/components/paytm/toast";
import { useSpeak } from "@/components/vyapar/voice";

type Info = { gender: string | null; persona: { name: string; speaker: string }; callVoiceMatches: boolean };

/** "Your AI's voice": voice notes and AI calls speak in the seller's gender, with matching Hindi grammar. */
export function VoiceSetting({ initial, sellerFirst }: { initial: Info; sellerFirst: string }) {
  const [info, setInfo] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const { play, playing } = useSpeak();
  const router = useRouter();
  async function choose(gender: "male" | "female") {
    setBusy(gender);
    const res = await fetch("/api/vyapar/seller/voice", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ gender }) }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (!res?.ok) return toast("Couldn't save the voice");
    setInfo(res.data);
    toast(`Voice set: ${gender === "male" ? "male" : "female"} (${res.data.persona.name})`);
    router.refresh();
  }
  const g = info.gender;
  return <div className="card stack" style={{ gap: 8 }}>
    <div className="row"><Mic size={18} color="var(--pt-cyan-600)" /><b className="grow" style={{ color: "var(--pt-navy)" }}>Your AI&apos;s voice</b>
      <button className="btn btn-ghost btn-sm" onClick={() => play(g === "male" ? `Namaste ji, main ${sellerFirst}, aapse baat karke achha laga. Kal sample bhej deta hoon.` : `Namaste ji, main ${sellerFirst}, aapse baat karke achha laga. Kal sample bhej deti hoon.`)} disabled={!g}>{playing ? "Stop" : "Hear it"}</button>
    </div>
    <span className="small muted">Voice notes and AI calls speak for you, so they match you: voice and Hindi grammar (&ldquo;bhejta hoon&rdquo; / &ldquo;bhejti hoon&rdquo;).</span>
    <div className="seg-mini" style={{ justifySelf: "start" }} role="radiogroup" aria-label="Voice">
      {(["male", "female"] as const).map((x) => <button key={x} role="radio" aria-checked={g === x} className={g === x ? "on" : ""} onClick={() => choose(x)} disabled={busy !== null}>{busy === x && <LoaderCircle className="spin" size={12} />}{x === "male" ? "Male voice" : "Female voice"}</button>)}
    </div>
    {!g && <span className="xs" style={{ color: "#b54708" }}>Not chosen yet: the female voice is used until you pick.</span>}
    {g && <span className="xs muted">Calling agent: <b>{info.persona.name}</b> · voice notes: Sarvam &ldquo;{info.persona.speaker}&rdquo;</span>}
    {g && !info.callVoiceMatches && <span className="xs" style={{ color: "#b54708" }}>Live calls still use the default female voice until the male-voice agent is published on Sarvam (SARVAM_APP_ID_MALE). The opening line already speaks as male.</span>}
  </div>;
}
