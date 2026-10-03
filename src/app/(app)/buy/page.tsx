import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import { AppBar, dayLabel } from "@/components/paytm/ui";
import { NeedComposer } from "@/components/vyapar/need-composer";
import { PRODUCTS, type ProductKey } from "@/lib/vyapar/needs";
import { listNeeds } from "@/lib/vyapar/server/needs";

export const dynamic = "force-dynamic";

export default async function BuyPage() {
  const { buyer, needs } = await listNeeds();
  return <div className="page">
    <AppBar title="Buy supplies" sub={`Viewing as ${buyer.name} (demo buyer)`} back="/" />
    <main className="scroll">
      <div className="pad">
        <div className="role-note">Demo: you are <b>{buyer.ownerName}</b>, owner of {buyer.name}. Post what you need; get up to 3 offers from nearby sellers who can actually deliver it.</div>
        <NeedComposer />
        {needs.length > 0 && <div className="card">
          <div className="card-title">Your requests</div>
          {needs.map((n) => <Link key={n.id} href={`/buy/${n.id}`} className="list-row"><Package size={18} color="var(--pt-cyan-600)" /><div className="grow"><b>{n.quantity.toLocaleString("en-IN")} {PRODUCTS[n.productKey as ProductKey].label.toLowerCase()}es by {dayLabel(new Date(`${n.neededBy}T12:00:00+05:30`))}</b><small>{n.introductions.length ? `${n.introductions.length} seller${n.introductions.length > 1 ? "s" : ""} contacted` : "No seller chosen yet"} · {n.status.toLowerCase()}</small></div><ChevronRight size={18} /></Link>)}
        </div>}
      </div>
    </main>
  </div>;
}
