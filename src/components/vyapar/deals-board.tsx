"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, ChevronRight, LoaderCircle } from "lucide-react";
import { Avatar } from "@/components/paytm/ui";
import { toast } from "@/components/paytm/toast";

type Row = { id: string; merchantId: string; name: string; category: string; stage: string; stageLabel: string; valueInr: number; objection: string | null; note: string | null; cold: boolean; needsYou: boolean };
type Revival = { dealId: string; merchantName: string; quote: string | null; saidAt: string; changes: string[]; cta: string; score: number };

const STAGE_BADGE: Record<string, string> = { ORDER_WON: "b-green", SAMPLE_REQUESTED: "b-green", SAMPLE_SENT: "b-cyan", MEETING_BOOKED: "b-cyan", OBJECTION: "b-amber", REPLIED: "b-navy", PITCHED: "b-grey", LOST: "b-grey" };
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function ReviveCards({ revivals }: { revivals: Revival[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  async function revive(r: Revival) {
    setBusy(r.dealId);
    const res = await fetch(`/api/vyapar/revive/${r.dealId}`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (res?.ok) { toast(`Revive offer sent to ${r.merchantName}`); router.push(`/vyapar/deals/${r.dealId}`); }
    else { setBusy(null); toast("Couldn't send the revive offer"); }
  }
  return <>{revivals.map((r) => <div className="revive" key={r.dealId}>
    <div className="h"><span className="badge b-green"><BellRing />Revive now</span><b className="grow">{r.merchantName} is worth another try</b></div>
    <div className="arrow">
      <div><span className="muted xs">They said ({new Date(r.saidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })})</span><br /><i>&ldquo;{r.quote}&rdquo;</i></div>
      <ChevronRight />
      <div><span className="muted xs">What changed</span><br />{r.changes.join(". ")}</div>
    </div>
    <button className="btn btn-primary btn-block btn-sm" onClick={() => revive(r)} disabled={busy !== null}>{busy === r.dealId ? <LoaderCircle className="spin" /> : null}{r.cta}</button>
  </div>)}</>;
}

const FILTERS = [["needs", "Needs you"], ["all", "All"], ["active", "In talks"], ["won", "Won"]] as const;

export function DealList({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("needs");
  const shown = rows.filter((r) => filter === "all" || (filter === "needs" ? r.needsYou : filter === "won" ? r.stage === "ORDER_WON" : !["ORDER_WON", "LOST"].includes(r.stage)));
  return <div className="card">
    <div className="tabs" style={{ marginBottom: 6 }}>{FILTERS.map(([k, label]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{label} {rows.filter((r) => k === "all" || (k === "needs" ? r.needsYou : k === "won" ? r.stage === "ORDER_WON" : !["ORDER_WON", "LOST"].includes(r.stage))).length}</button>)}</div>
    {shown.map((r) => <Link key={r.id} href={`/vyapar/deals/${r.id}`} className="deal-row">
      <Avatar name={r.name} />
      <div className="grow"><b>{r.name}</b><small>{r.objection ? `${r.objection} · ` : ""}{r.note ?? r.category}</small></div>
      <div className="right"><b>{inr(r.valueInr)}</b><span className={`badge ${r.cold ? "b-grey" : STAGE_BADGE[r.stage] ?? "b-grey"}`}>{r.cold ? "Going cold" : r.stageLabel}</span></div>
    </Link>)}
    {!shown.length && <div className="empty">Nothing here. Nice work 🎉</div>}
  </div>;
}
