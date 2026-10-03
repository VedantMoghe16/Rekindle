import { Brain, Building2, MessageCircle, Phone, Send, ShoppingCart, Bot, StickyNote } from "lucide-react";
import { AppBar, ProviderTag, dayLabel, timeLabel } from "@/components/paytm/ui";
import { HomeNav, VyaparTabs } from "@/components/paytm/nav";
import { AskBox } from "@/components/vyapar/ask-box";
import { db } from "@/lib/db";
import { isCogneeConfigured } from "@/lib/providers/cognee";

export const dynamic = "force-dynamic";

const ICON = { PITCH: Send, REPLY: MessageCircle, CALL: Phone, NEED: ShoppingCart, FLEET: Bot, BUSINESS: Building2, NOTE: StickyNote } as const;
const COGNEE: Record<string, string> = { saved: "b-green", pending: "b-cyan", failed: "b-red", skipped: "b-grey" };

export default async function MemoryPage() {
  const events = await db.knowledgeEvent.findMany({ orderBy: { createdAt: "desc" }, take: 80 });
  const counts = await db.knowledgeEvent.groupBy({ by: ["kind"], _count: true });
  let lastDay = "";
  return <div className="page">
    <AppBar title="Business memory" sub={isCogneeConfigured() ? "Everything your AI team learned · Cognee knowledge graph" : "Everything your AI team learned"} right={<ProviderTag provider={isCogneeConfigured() ? "cognee" : "local"} />} />
    <VyaparTabs />
    <main className="scroll"><div className="pad">
      <div className="card stack">
        <div className="card-title"><span className="row"><Brain size={16} />Ask your business memory</span></div>
        <AskBox placeholder="e.g. Which shops agreed to a sample?" initial="What happened in the last AI sales team run?" />
      </div>
      <div className="stats-mini">{(["CALL", "PITCH", "REPLY"] as const).map((k) => <div key={k} className="kpi" style={{ padding: 10 }}><small>{k === "CALL" ? "Calls remembered" : k === "PITCH" ? "Pitches sent" : "Replies"}</small><b style={{ fontSize: 18 }}>{counts.find((c) => c.kind === k)?._count ?? 0}</b></div>)}</div>
      {events.length === 0 && <div className="empty">Nothing yet. Run your AI sales team and every pitch, reply and call will be remembered here.</div>}
      {events.map((e) => {
        const d = dayLabel(e.createdAt);
        const header = d !== lastDay ? <div className="mem-day" key={`d-${d}`}>{d}</div> : null;
        lastDay = d;
        const Icon = ICON[e.kind as keyof typeof ICON] ?? StickyNote;
        return [header, <div key={e.id} className="card" style={{ display: "grid", gap: 4, padding: 12 }}>
          <div className="row"><Icon size={16} color="var(--pt-cyan-600)" /><b className="grow small">{e.title}</b><span className="xs muted">{timeLabel(e.createdAt)}</span></div>
          <div className="small" style={{ whiteSpace: "pre-line" }}>{e.text.length > 420 ? `${e.text.slice(0, 420)}…` : e.text}</div>
          <span className={`badge ${COGNEE[e.cognee] ?? "b-grey"}`} style={{ justifySelf: "start" }}>{e.cognee === "saved" ? "In knowledge graph" : e.cognee === "pending" ? "Adding to knowledge graph…" : e.cognee === "failed" ? "Knowledge graph write failed" : "Saved locally"}</span>
        </div>];
      })}
    </div></main>
    <HomeNav />
  </div>;
}
