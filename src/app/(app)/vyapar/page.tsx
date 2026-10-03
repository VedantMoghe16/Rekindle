import { VyaparIntro } from "@/components/vyapar/vyapar-intro";
import Link from "next/link";
import { BellRing, ChevronRight, Search } from "lucide-react";
import { AppBar, dayLabel } from "@/components/paytm/ui";
import { HomeNav, VyaparTabs } from "@/components/paytm/nav";
import { PromptBox } from "@/components/vyapar/prompt-box";
import { recentHunts } from "@/lib/vyapar/server/hunts";
import { getDealsOverview, getHomeStats } from "@/lib/vyapar/server/insights";

export const dynamic = "force-dynamic";

export default async function VyaparHome() {
  const [stats, hunts, overview] = await Promise.all([getHomeStats(), recentHunts(), getDealsOverview()]);
  const top = overview.revivals[0];
  return <div className="page">
    <AppBar title="Vyapar AI" sub="Your AI sales teammate" right={<VyaparIntro />} />
    <VyaparTabs />
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
      </div>
    </main>
    <HomeNav />
  </div>;
}
