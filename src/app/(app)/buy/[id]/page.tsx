import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { AppBar, dayLabel } from "@/components/paytm/ui";
import { OfferCard } from "@/components/vyapar/offer-card";
import { AskBox } from "@/components/vyapar/ask-box";
import { getNeed } from "@/lib/vyapar/server/needs";

export const dynamic = "force-dynamic";

const rs = (p: number) => { const r = p / 100; return `₹${Number.isInteger(r) ? r : r.toFixed(2)}`; };

export default async function NeedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getNeed(id);
  if (!v) notFound();
  const { need, product } = v;
  const canRequest = v.introductionsLeft > 0;
  return <div className="page">
    <AppBar title={`${need.quantity.toLocaleString("en-IN")} ${product.label.toLowerCase()}es`} sub={`Viewing as ${v.buyer.name} (demo buyer)`} back="/buy" />
    <main className="scroll">
      <div className="pad">
        <div className="card stack" style={{ gap: 6 }}>
          <div className="small muted">&ldquo;{need.rawInput}&rdquo;</div>
          <div className="plan-grid">
            <div><small>Product</small><b>{product.label}</b></div>
            <div><small>Quantity</small><b>{need.quantity.toLocaleString("en-IN")} {product.unit}es</b></div>
            <div><small>Needed by</small><b>{dayLabel(new Date(`${need.neededBy}T12:00:00+05:30`))}</b></div>
            <div><small>Max price</small><b>{need.maxUnitPricePaise ? `${rs(need.maxUnitPricePaise)} each` : "Not set"}</b></div>
          </div>
          {(need.sampleFirst || need.backupSupplier) && <div className="row" style={{ gap: 6 }}>{need.sampleFirst && <span className="badge b-amber">Sample first</span>}{need.backupSupplier && <span className="badge b-navy">Backup supplier</span>}</div>}
        </div>
        <div className="sec-title">{v.top.length ? `${v.top.length} offer${v.top.length > 1 ? "s" : ""} that fit${v.top.length > 1 ? "" : "s"}, cheapest first` : "No seller can meet this yet"}</div>
        {v.top.map((m, i) => <OfferCard key={m.offerId} needId={need.id} m={m} best={i === 0} canRequest={canRequest} />)}
        {!canRequest && <div className="note"><Info size={14} />You&apos;ve contacted 3 sellers for this request, the maximum. This keeps your inbox free of spam.</div>}
        {v.needsConfirmation.length > 0 && <div className="excluded">
          <b style={{ color: "var(--pt-ink)" }}>Waiting on seller confirmation</b>
          {v.needsConfirmation.map((m) => <span key={m.offerId}>{m.seller.name}: {m.reason}. We&apos;ll show it once they reconfirm.</span>)}
        </div>}
        {v.excluded.length > 0 && <div className="excluded">
          <b style={{ color: "var(--pt-ink)" }}>Can&apos;t meet this request</b>
          {v.excluded.map((m) => <span key={m.offerId}>{m.seller.name}: {m.reason}</span>)}
        </div>}
        <div className="card stack">
          <div className="card-title">Ask about these sellers</div>
          <AskBox placeholder="e.g. Which supplier had a leak complaint?" initial="Which supplier had a grease-leak complaint?" />
        </div>
        <div className="note"><Info size={14} />Sellers and prices are demo data. Stock counts only if the seller confirmed it in the last 48 hours. Only the seller you pick can contact you about this request.</div>
      </div>
    </main>
  </div>;
}
