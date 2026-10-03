"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BellOff, MessageSquareText, X } from "lucide-react";
import { DraftPanel } from "@/components/brief/draft-panel";

export function RecActions({ recommendationId, accountId, defaultChannel = "whatsapp", showOpen = true, status }: { recommendationId: string; accountId?: string; defaultChannel?: "whatsapp" | "email"; showOpen?: boolean; status?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function act(action: "snooze" | "dismiss") {
    setBusy(action); setError("");
    const response = await fetch(`/api/recommendations/${recommendationId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).then((r) => r.json()).catch(() => ({ ok: false, error: { message: "We couldn't reach the server." } }));
    setBusy("");
    if (!response.ok) { setError(response.error.message); return; }
    router.refresh();
  }

  return <div className="rec-actions">
    <div className="card-actions">
      <button className="button primary" onClick={() => setOpen((value) => !value)}><MessageSquareText /> {open ? "Hide draft" : status === "drafted" ? "Open draft" : "Generate draft"}</button>
      {showOpen && accountId && <Link className="button" href={`/accounts/${accountId}`}>Open account <ArrowUpRight /></Link>}
      <button className="button" disabled={Boolean(busy)} onClick={() => act("snooze")}><BellOff /> {busy === "snooze" ? "Snoozing…" : "Snooze 7d"}</button>
      <button className="button" disabled={Boolean(busy)} onClick={() => act("dismiss")}><X /> {busy === "dismiss" ? "Dismissing…" : "Dismiss"}</button>
    </div>
    {error && <p className="error">{error}</p>}
    {open && <DraftPanel recommendationId={recommendationId} defaultChannel={defaultChannel} autoGenerate />}
  </div>;
}
