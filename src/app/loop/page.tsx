import { Lightbulb } from "lucide-react";
import { formatINR } from "@/lib/format";
import { getLoop } from "@/lib/services/loop";

export const dynamic = "force-dynamic";

const stageLabel: Record<string, string> = { recommended: "Recommended", drafted: "Drafted", sent: "Sent", replied: "Replied", meeting: "Meeting", won: "Won" };
const pretty = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");

export default async function LoopPage() {
  const loop = await getLoop();
  const top = Math.max(1, ...loop.funnel.map((stage) => stage.count));
  return <div className="content">
    <div className="eyebrow">Learn · Revenue loop</div>
    <h1>What actually brings deals back</h1>
    <p className="subtitle">Every recommendation, message and campaign traced to replies, meetings and wins. <span className="badge demo">Seeded history</span>{loop.liveOutcomes > 0 && <span className="badge">+{loop.liveOutcomes} live outcomes</span>}</p>

    <section className="loop-callouts">{loop.callouts.map((text) => <div className="loop-callout" key={text}><Lightbulb />{text}</div>)}</section>

    <section className="panel loop-panel">
      <div className="section-head"><div><h2>Outcome funnel</h2><p>From recommendation to closed deal.</p></div></div>
      <div className="funnel" role="list">{loop.funnel.map((stage, index) => {
        const prev = index > 0 ? loop.funnel[index - 1].count : null;
        const conversion = prev ? Math.round((100 * stage.count) / prev) : null;
        return <div className="funnel-row" role="listitem" key={stage.stage} title={`${stageLabel[stage.stage]}: ${stage.count}${conversion !== null ? ` (${conversion}% of previous stage)` : ""}`}>
          <span className="funnel-label">{stageLabel[stage.stage]}</span>
          <span className="funnel-track"><span className="funnel-bar" style={{ width: `${Math.max(2, (100 * stage.count) / top)}%` }} /></span>
          <span className="funnel-value">{stage.count}{conversion !== null && <span className="meta"> · {conversion}%</span>}</span>
        </div>;
      })}</div>
    </section>

    <section className="panel loop-panel">
      <div className="section-head"><div><h2>What revives deals</h2><p>Stall reason × signal, sorted by reply rate. This tells reps which signals deserve a same-day call.</p></div></div>
      <table className="loop-table">
        <thead><tr><th>Stall reason</th><th>Signal</th><th>Sent</th><th>Reply rate</th><th>Meeting rate</th><th>Won</th></tr></thead>
        <tbody>{loop.table.map((row) => <tr key={`${row.stallCategory}-${row.signalType}`}>
          <td><strong>{pretty(row.stallCategory)}</strong></td><td>{pretty(row.signalType)}</td><td>{row.sent}</td>
          <td><span className="rate"><span className="rate-bar" style={{ width: `${row.replyRate}%` }} /></span>{row.replyRate}%</td>
          <td>{row.meetingRate}%</td><td>{row.won}</td>
        </tr>)}</tbody>
      </table>
    </section>

    <section className="panel loop-panel">
      <div className="section-head"><div><h2>Campaign impact</h2><p>Marketing measured in pipeline, not clicks.</p></div></div>
      {loop.campaignImpact.length === 0 ? <p className="subtitle">No campaign has launched yet. Launch one from Insights &amp; Campaigns.</p> :
        <table className="loop-table"><thead><tr><th>Campaign</th><th>Targets</th><th>Engaged</th><th>Moved to Revive</th><th>Pipeline influenced</th></tr></thead>
          <tbody>{loop.campaignImpact.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><div className="meta">{row.status === "launched" ? "Launched via n8n" : "Launched · Simulated"}</div></td><td>{row.targets}</td><td>{row.engaged}</td><td>{row.movedToRevive}</td><td>{formatINR(row.influencedInr)}</td></tr>)}</tbody></table>}
    </section>
  </div>;
}
