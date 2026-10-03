import Link from "next/link";
import { notFound } from "next/navigation";
import { AppBar, Avatar, dayLabel } from "@/components/paytm/ui";
import { RequestReply } from "@/components/vyapar/request-reply";
import { rupeesFromPaise } from "@/lib/vyapar/needs";
import { getSellerRequest } from "@/lib/vyapar/server/needs";

export const dynamic = "force-dynamic";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getSellerRequest(id);
  if (!r) notFound();
  const t = r.terms;
  return <div className="page">
    <AppBar title="Buyer request" sub={`${r.buyer.name} chose you`} back="/vyapar/deals" />
    <div className="target-strip">
      <Avatar name={r.buyer.name} />
      <div className="grow"><b>{r.buyer.name}</b><small>{r.buyer.ownerName} · {r.buyer.category} · {r.buyer.area}</small></div>
      <span className={`badge ${r.status === "ACCEPTED" ? "b-green" : r.status === "DECLINED" ? "b-grey" : "b-amber"}`}>{r.status === "REQUESTED" ? "Awaiting you" : r.status.toLowerCase()}</span>
    </div>
    <div className="pad" style={{ paddingBottom: 0 }}>
      <div className="card stack" style={{ gap: 6 }}>
        <span className="badge b-red" style={{ justifySelf: "start" }}>Buyer said</span>
        <q className="small">{r.need.rawInput}</q>
        <div className="plan-grid">
          <div><small>Needs</small><b>{t.quantity.toLocaleString("en-IN")} {r.product.label.toLowerCase()}es</b></div>
          <div><small>By</small><b>{dayLabel(new Date(`${t.neededBy}T12:00:00+05:30`))}</b></div>
          <div><small>Your offer</small><b>{rupeesFromPaise(t.unitPricePaise)} each · {rupeesFromPaise(t.subtotalPaise)}</b></div>
          <div><small>You deliver</small><b>{new Date(t.deliverBy).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" })}</b></div>
        </div>
        {t.sampleNote && <span className="small">Sample: {t.sampleNote}</span>}
        {r.dealId && <Link className="link" href={`/vyapar/deals/${r.dealId}`}>Open the conversation →</Link>}
      </div>
    </div>
    <RequestReply id={r.id} draft={r.draft} done={r.status !== "REQUESTED"} />
  </div>;
}
