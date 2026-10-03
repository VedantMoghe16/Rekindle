import Link from "next/link";
import { db } from "@/lib/db";
import { formatINR, formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await db.account.findMany({ include: { deals: { include: { memory: true } }, signals: { orderBy: { occurredAt: "desc" }, take: 1 } }, orderBy: { name: "asc" } });
  return <div className="content"><div className="eyebrow">Revenue memory</div><h1>Accounts</h1><p className="subtitle">Every stalled deal, its remembered blocker, and what changed.</p>
    <div className="section-head"><div><h2>{accounts.length} stalled accounts</h2></div><button className="button primary">+ Add account</button></div>
    <table className="account-table"><thead><tr><th>Account</th><th>Deal value</th><th>Stall reason</th><th>Lane</th><th>Priority</th><th>Last touch</th><th>Latest signal</th></tr></thead><tbody>
      {accounts.map((account) => { const deal = account.deals[0]; return <tr key={account.id}><td><Link href={`/accounts/${account.id}`}><strong>{account.name}</strong></Link><div className="meta">{account.industry} · {account.city}</div></td><td>{deal.valueInr ? formatINR(deal.valueInr) : "Not set"}</td><td>{deal.memory?.stallCategory.replaceAll("_", " ") ?? "New lead"}</td><td><span className={`lane ${deal.lane.toLowerCase()}`}>{deal.lane}</span></td><td>{deal.priorityScore || "—"}</td><td>{deal.lastTouchAt ? formatShortDate(deal.lastTouchAt) : "No conversation"}</td><td>{account.signals[0]?.title ?? "No new signal"}</td></tr>; })}
    </tbody></table>
  </div>;
}
