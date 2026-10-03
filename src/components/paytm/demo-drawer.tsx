"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, RotateCcw, X } from "lucide-react";
import { toast } from "@/components/paytm/toast";

type Status = { providers: Record<string, { live: boolean; detail: string }> };

/** Judge-facing controls: which sponsor services are live vs fallback, and a one-click demo reset. */
export function DemoDrawer() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !status) {
      const res = await fetch("/api/demo/status").then((r) => r.json()).catch(() => null);
      if (res?.ok) setStatus(res.data);
    }
  }
  async function reset() {
    setBusy(true);
    const res = await fetch("/api/vyapar/demo/reset", { method: "POST" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      toast("Demo reset: fresh merchants and deals");
      router.push("/");
      router.refresh();
    } else toast("Reset failed. Check the server log");
  }

  return <>
    {open && <div className="demo-panel" role="dialog" aria-label="Demo controls">
      <div className="row"><h3 className="grow">Demo controls</h3><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X /></button></div>
      <div className="stack">
        {status ? Object.entries(status.providers).map(([name, p]) => <div className="prov" key={name}><span className={`dot${p.live ? " live" : ""}`} /><b className="grow" style={{ textTransform: "capitalize" }}>{name}</b><span className="muted xs">{p.live ? "live" : "fallback"}</span></div>) : <span className="muted">Loading provider status…</span>}
      </div>
      <p className="muted xs">Without keys, every AI step uses deterministic rules and templates, labelled in the UI. Merchants are fictional demo data.</p>
      <button className="btn btn-navy btn-sm" onClick={reset} disabled={busy}><RotateCcw className={busy ? "spin" : ""} />Reset demo data</button>
    </div>}
    <button className="demo-fab" onClick={toggle}><FlaskConical />Demo</button>
  </>;
}
