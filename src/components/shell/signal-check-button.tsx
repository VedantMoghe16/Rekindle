"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

type Result = { steps: string[]; signalsAdded: number; laneChanges: { accountName: string; toLane: string }[] };

export function SignalCheckButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function run() {
    setRunning(true); setOpen(true); setResult(null); setError("");
    try {
      const response = await fetch("/api/signals/run", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.json());
      if (!response.ok) setError(response.error.message);
      else { setResult(response.data); router.refresh(); }
    } catch { setError("The signal check could not reach the server."); }
    finally { setRunning(false); }
  }

  return <div className="signal-check" ref={ref}>
    <button className="button primary" onClick={run} disabled={running}><Play /> {running ? "Checking signals…" : "Run signal check"}</button>
    {open && <div className="signal-popover" role="status">
      <div className="field-label">Signal check</div>
      {running && <div className="signal-step running">Checking careers boards, news, dates & renewals…</div>}
      {result?.steps.map((step, i) => <div className="signal-step" key={i}>{step}</div>)}
      {result && <div className="signal-summary">{result.signalsAdded} new signal{result.signalsAdded === 1 ? "" : "s"} · {result.laneChanges.length} lane change{result.laneChanges.length === 1 ? "" : "s"}</div>}
      {error && <p className="error">{error}</p>}
    </div>}
  </div>;
}
