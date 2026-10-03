"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PromoteButton({ id, accountId }: { id: string; accountId: string | null }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  async function promote() { setBusy(true); const body = await fetch(`/api/leads/${id}/promote`, { method: "POST" }).then((r) => r.json()); setBusy(false); if (body.ok) router.push(`/accounts/${body.data.accountId}`); }
  if (accountId) return <button className="button" onClick={() => router.push(`/accounts/${accountId}`)}>Open account →</button>;
  return <button className="button primary" disabled={busy} onClick={promote}>{busy ? "Adding…" : "Shortlist →"}</button>;
}
