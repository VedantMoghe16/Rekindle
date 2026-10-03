"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type LaneChange = { id: string; accountId: string; accountName: string; fromLane: string; toLane: string; reason: string };
type Toast = LaneChange & { expires: number };

const LANE: Record<string, string> = { REVIVE: "Revive now", WARM: "Warming up", WATCH: "Watching" };
const TTL = 8_000;

export function Toasts() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const shown = useRef(new Set<string>());

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/lane-changes?unseen=1", { cache: "no-store" }).then((r) => r.json());
      if (!response.ok) return;
      const fresh = (response.data as LaneChange[]).filter((change) => !shown.current.has(change.id));
      if (!fresh.length) return;
      fresh.forEach((change) => shown.current.add(change.id));
      setToasts((current) => [...fresh.reverse().map((change) => ({ ...change, expires: Date.now() + TTL })), ...current].slice(0, 5));
      await fetch("/api/lane-changes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: fresh.map((change) => change.id) }) });
      router.refresh();
    } catch { /* offline: try again next tick */ }
  }, [router]);

  useEffect(() => {
    void poll();
    const interval = setInterval(poll, 5_000);
    return () => clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    if (!toasts.length) return;
    const next = Math.min(...toasts.map((toast) => toast.expires)) - Date.now();
    const timer = setTimeout(() => setToasts((current) => current.filter((toast) => toast.expires > Date.now())), Math.max(50, next));
    return () => clearTimeout(timer);
  }, [toasts]);

  if (!toasts.length) return null;
  return <div className="toast-stack" aria-live="polite">
    {toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.toLane.toLowerCase()}`}>
      <div className="toast-body">
        <Link href={`/accounts/${toast.accountId}`}><strong>{toast.accountName}</strong> moved to {LANE[toast.toLane] ?? toast.toLane}</Link>
        <div className="meta">{toast.reason}</div>
      </div>
      <button className="toast-close" aria-label="Dismiss" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X /></button>
    </div>)}
  </div>;
}
