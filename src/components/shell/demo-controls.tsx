"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Megaphone, RotateCcw, SlidersHorizontal, X } from "lucide-react";

type Provider = { live: boolean; detail: string };
type Status = { offline: boolean; providers: Record<"claude" | "sarvam" | "cognee" | "n8n", Provider>; cache: { llm: number; sources: number } };
type LogLine = { id: number; text: string };

const providerNames: Record<string, string> = { claude: "Claude", sarvam: "Sarvam", cognee: "Cognee", n8n: "n8n" };

export function DemoControls() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);

  const loadStatus = useCallback(async () => {
    const body = await fetch("/api/demo/status").then((r) => r.json()).catch(() => null);
    if (body?.ok) setStatus(body.data);
  }, []);

  useEffect(() => { if (open) void loadStatus(); }, [open, loadStatus]);

  function push(text: string) {
    setLog((old) => [{ id: Date.now() + Math.random(), text }, ...old].slice(0, 12));
  }

  async function run(label: string, url: string, describe: (data: Record<string, unknown>) => string[]) {
    setBusy(label);
    try {
      const body = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.json());
      if (!body.ok) { push(`${label} failed: ${body.error?.message ?? "unknown error"}`); return; }
      const lines = describe(body.data);
      for (const [index, line] of lines.entries()) setTimeout(() => push(line), index * 600);
      setTimeout(() => router.refresh(), lines.length * 600);
      void loadStatus();
    } catch {
      push(`${label} failed: network error`);
    } finally {
      setBusy("");
    }
  }

  return <>
    <button className="button" onClick={() => setOpen(true)}><SlidersHorizontal /> Demo controls</button>
    {open && <div className="drawer-scrim" onClick={() => setOpen(false)} />}
    <aside className={`drawer ${open ? "open" : ""}`} aria-hidden={!open} aria-label="Demo controls">
      <div className="drawer-head"><strong>Demo controls</strong><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><X /></button></div>
      <div className="field-label">Providers</div>
      <div className="provider-grid">{status ? Object.entries(status.providers).map(([key, provider]) => <div className="provider-pill" key={key}>
        <span className={`status-dot ${provider.live ? "live" : "fallback"}`} aria-hidden /><strong>{providerNames[key]}</strong><span className="meta">{provider.live ? "Live" : "Fallback"} · {provider.detail}</span>
      </div>) : <span className="meta">Loading…</span>}</div>
      {status && <p className="meta">LLM cache {status.cache.llm} responses · source cache {status.cache.sources} · {status.offline ? "offline mode on" : "live calls allowed"}</p>}

      <div className="field-label">Golden path</div>
      <div className="drawer-actions">
        <button className="button primary" disabled={Boolean(busy)} onClick={() => run("Simulate engagement", "/api/demo/simulate-engagement", (data) => [
          ...((data.events as { accountName: string; type: string; roleTitle?: string }[] | undefined) ?? []).map((event) => `${event.accountName}: ${event.roleTitle ?? "Someone"} ${event.type === "click" ? "clicked" : event.type === "like" ? "liked" : "engaged with"} the campaign`),
          ...((data.laneChanges as { accountName: string; toLane: string }[] | undefined) ?? []).map((change) => `${change.accountName} moved to ${change.toLane}`),
        ])}><Megaphone />{busy === "Simulate engagement" ? "Simulating…" : "Simulate campaign engagement"}</button>
        <button className="button" disabled={Boolean(busy)} onClick={() => run("Re-index knowledge", "/api/knowledge/ingest", (data) => [`Knowledge indexed: ${String(data.documents ?? data.count ?? "done")}`])}><Database />{busy === "Re-index knowledge" ? "Indexing…" : "Re-index deal memory (Cognee)"}</button>
        <button className="button" disabled={Boolean(busy)} onClick={() => run("Reset demo", "/api/demo/reset", (data) => [`Demo reset: ${data.revive} Revive / ${data.warm} Warm / ${data.watch} Watch`])}><RotateCcw />{busy === "Reset demo" ? "Resetting…" : "Reset demo data"}</button>
      </div>

      <div className="field-label">Activity</div>
      <ul className="drawer-log">{log.length ? log.map((line) => <li key={line.id}>{line.text}</li>) : <li className="meta">Nothing yet.</li>}</ul>
    </aside>
  </>;
}
