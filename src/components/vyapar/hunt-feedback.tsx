"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, LoaderCircle, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "@/components/paytm/toast";

export function ClarifyCard({ huntId, question, why }: { huntId: string; question: string; why: string }) {
  const [busy, setBusy] = useState<boolean | null>(null);
  const router = useRouter();
  async function answer(canSupplyBulk: boolean) {
    setBusy(canSupplyBulk);
    const res = await fetch("/api/vyapar/preferences/clarify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ canSupplyBulk, huntId }) }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (res?.ok) { toast(`Noted: you ${res.data.label}`); router.refresh(); } else toast("Couldn't save your answer");
  }
  return <div className="clarify">
    <div className="row"><HelpCircle size={18} color="var(--pt-cyan-600)" /><b className="grow">{question}</b></div>
    <span className="small muted">{why}</span>
    <div className="row"><button className="btn btn-primary btn-sm grow" onClick={() => answer(true)} disabled={busy !== null}>{busy === true && <LoaderCircle className="spin" />}Yes, I can</button><button className="btn btn-ghost btn-sm grow" onClick={() => answer(false)} disabled={busy !== null}>{busy === false && <LoaderCircle className="spin" />}Not yet</button></div>
  </div>;
}

type Pref = { id: string; label: string; affected: number; merchantNames: string[]; kind: string };

export function PreferencePanel({ prefs, moved }: { prefs: Pref[]; moved: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  if (!prefs.length) return null;
  async function undo(id: string) {
    setBusy(id);
    const res = await fetch(`/api/vyapar/preferences/${id}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (res?.ok) { toast("Undone: list restored"); router.refresh(); } else toast("Couldn't undo");
  }
  return <div className="prefs">
    <div className="row"><SlidersHorizontal size={16} color="var(--pt-navy)" /><b className="grow">Tuned to your feedback</b>{moved > 0 && <span className="badge b-cyan">{moved} moved since search</span>}</div>
    {prefs.map((p) => <div className="pref-row" key={p.id}>
      <div className="grow"><span className="small">You {p.kind === "SAVE" ? "" : "said: "}<b>{p.label}</b></span>
        <div className="xs muted">{p.kind === "SAVE" ? "Ranked higher" : p.affected ? `Removed ${p.affected}: ${p.merchantNames.join(", ")}${p.affected > p.merchantNames.length ? "…" : ""}` : "No change in this search"}</div></div>
      <button className="btn btn-ghost btn-sm" onClick={() => undo(p.id)} disabled={busy !== null} aria-label={`Undo ${p.label}`}>{busy === p.id ? <LoaderCircle className="spin" /> : <RotateCcw />}Undo</button>
    </div>)}
    <span className="xs muted">Only your explicit choices change the ranking. Rules engine, not a trained model.</span>
  </div>;
}
