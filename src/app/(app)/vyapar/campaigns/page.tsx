import { AppBar, ProviderTag, dayLabel } from "@/components/paytm/ui";
import { VyaparTabs } from "@/components/paytm/nav";
import { CampaignStudio } from "@/components/vyapar/campaign-studio";
import { getCampaignState } from "@/lib/vyapar/server/insights";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const s = await getCampaignState();
  const max = Math.max(1, ...s.objections.map((o) => o.count));
  return <div className="page">
    <AppBar title="Campaigns" sub="Built from what buyers actually said" back="/vyapar" />
    <main className="scroll">
      <div className="pad">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Top objections · {s.totalReplies} replies <span className="badge b-cyan">This month</span></div>
          {s.objections.length ? <div className="obj-bars">{s.objections.map((o, i) => <div className={`ob${i === 0 ? " top" : ""}`} key={o.category} title={o.quotes.join(" · ")}><div><span>{o.label}</span><div className="track"><i style={{ width: `${(o.count / max) * 100}%` }} /></div></div><b>{o.count}</b></div>)}</div> : <div className="empty">No objections yet. Pitch a few buyers first.</div>}
        </div>
        <CampaignStudio objection={s.top} headline={s.draft.headline} assets={s.draft.assets} audience={s.audience} handle="ecopack.andheri" />
        {s.campaigns.length > 0 && <div className="card">
          <div className="card-title">Launched</div>
          {s.campaigns.map((c) => <div className="list-row" key={c.id}><div className="grow"><b>{c.headline}</b><small>{c.audience} merchants · {dayLabel(c.createdAt)} · {c.status.replace("_", " ")}</small></div><ProviderTag provider={c.provider} /></div>)}
        </div>}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>What&apos;s working <span className="badge b-grey">Demo benchmark</span></div>
          <div className="funnel">{s.outcomes.map((o) => <div className="fr" key={o.objection}><span title={o.play}>{o.label} → {o.play.split(" ")[0].toLowerCase()}…</span><span className="bar"><i style={{ width: `${o.sampleRate}%` }} /></span><b>{o.sampleRate}%</b></div>)}</div>
          <p className="xs muted" style={{ marginTop: 8 }}>Demo benchmark (illustrative fixture), not learned from real outcomes. Autopilot uses the play ranked first here; real outcome logging is in My offers → Learning readiness.</p>
        </div>
      </div>
    </main>
    <VyaparTabs />
  </div>;
}
