import Link from "next/link";
import { BellRing, Brain, ChevronRight, MessageCircle, Search, Sparkles, Truck } from "lucide-react";
import { AppBar, dayLabel } from "@/components/paytm/ui";
import { VyaparTabs } from "@/components/paytm/nav";
import { PromptBox } from "@/components/vyapar/prompt-box";
import { recentHunts } from "@/lib/vyapar/server/hunts";
import { getDealsOverview, getHomeStats } from "@/lib/vyapar/server/insights";

export const dynamic = "force-dynamic";

export default async function VyaparHome() {
  const [stats, hunts, overview] = await Promise.all([getHomeStats(), recentHunts(), getDealsOverview()]);
  const top = overview.revivals[0];
  return <div className="page">
    <AppBar title="Vyapar AI" sub="Your AI sales teammate" back="/" right={<span className="ai-chip"><Sparkles />Beta</span>} />
    <main className="scroll">
      <div className="hero-ai">
        <div className="greet">Namaste {stats.ownerFirstName} 👋</div>
        <h2>Kya bechna hai, aur <em>kisko?</em></h2>
        <PromptBox />
      </div>
      <div className="pad">
        {top && <Link href="/vyapar/deals" className="revive">
          <div className="h"><span className="badge b-green"><BellRing />Revive</span><b className="grow">{top.merchantName} is worth another try</b><ChevronRight size={18} /></div>
          <span className="small muted">{top.changes[0]}</span>
        </Link>}
        {hunts.length > 0 && <div className="card">
          <div className="card-title">Recent searches</div>
          {hunts.map((h) => <Link key={h.id} href={`/vyapar/hunts/${h.id}`} className="list-row"><Search size={18} color="var(--pt-cyan-600)" /><div className="grow"><b style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.prompt}</b><small>{h.leads} buyers · {dayLabel(h.createdAt)}</small></div><ChevronRight size={18} /></Link>)}
        </div>}
        <div className="card-title" style={{ padding: "4px 2px 0" }}>What Vyapar AI does for you</div>
        <div className="pillars">
          <div className="pillar"><Search /><b>Find</b><span>Nearby Paytm merchants who need your product</span></div>
          <div className="pillar"><MessageCircle /><b>Pitch</b><span>Telegram message, voice note and AI call in Hinglish</span></div>
          <div className="pillar"><Brain /><b>Remember</b><span>Every reply, objection and promise</span></div>
          <div className="pillar"><Truck /><b>Act</b><span>Books samples, visits and payments</span></div>
        </div>
      </div>
    </main>
    <VyaparTabs />
  </div>;
}
