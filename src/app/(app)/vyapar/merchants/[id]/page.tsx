import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, Brain, CalendarDays, Check, Clock, Heart, MessageCircle, TriangleAlert, Truck } from "lucide-react";
import { AppBar, Avatar, ProviderTag, dayLabel, timeLabel } from "@/components/paytm/ui";
import { VyaparTabs } from "@/components/paytm/nav";
import { AskBox } from "@/components/vyapar/ask-box";
import { imageFor } from "@/lib/vyapar/images";
import { isCogneeConfigured } from "@/lib/providers/cognee";
import { OBJECTION_LABELS, STAGE_TRACK, trackIndex, type Objection } from "@/lib/vyapar/taxonomy";
import { getMerchantMemory } from "@/lib/vyapar/server/insights";

export const dynamic = "force-dynamic";

const MEM_STYLE: Record<string, { cls: string; Icon: typeof Brain }> = {
  OBJECTION: { cls: "b-red", Icon: TriangleAlert }, TIMING: { cls: "b-navy", Icon: Clock }, COMMITMENT: { cls: "b-cyan", Icon: Box }, PREFERENCE: { cls: "b-amber", Icon: Heart },
};

export default async function MerchantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getMerchantMemory(id);
  if (!data) notFound();
  const { merchant, deal, memories, actions, distanceKm } = data;
  const web = merchant.profile.sources[0];
  const img = imageFor(merchant.category);
  const isPublic = merchant.source === "osm";
  const step = deal ? trackIndex(deal.stage) : 0;
  const nodes = [
    ...memories.filter((m) => m.kind === "OBJECTION" && m.category).slice(0, 2).map((m) => ({ label: (OBJECTION_LABELS[m.category as Objection] ?? m.category!).split(" ").slice(0, 2).join(" "), fill: "#fde8ee", color: "#c01048" })),
    { label: merchant.category, fill: "#e8f7fd", color: "#0098d1" },
    ...memories.filter((m) => m.kind === "TIMING").slice(0, 1).map((m) => ({ label: m.summary.replace("Restocks monthly on the ", "Restock ").slice(0, 12), fill: "#e6ecf5", color: "#002e6e" })),
    ...actions.slice(0, 1).map((a) => ({ label: a.type === "SAMPLE_DISPATCH" ? "Sample" : a.type === "MEETING" ? "Visit" : a.type === "PAYMENT_LINK" ? "Paid" : "Follow-up", fill: "#fff4e5", color: "#b54708" })),
    ...(web ? [{ label: `${web.rating.toFixed(1)}★ ${web.source}`, fill: "#e7f8ef", color: "#067647" }] : []),
  ].slice(0, 6);
  const angle = (i: number) => (Math.PI * 2 * i) / nodes.length - Math.PI / 2;

  return <div className="page">
    <AppBar title="Merchant memory" sub={isCogneeConfigured() ? "Cognee knowledge graph" : "Vyapar memory (Cognee when connected)"} back={deal ? `/vyapar/deals/${deal.id}` : "/vyapar/deals"} />
    <main className="scroll">
      {img && <div className="banner-photo" style={{ backgroundImage: `url(${img.src})` }}>
        <span className="credit">Representative photo · <a href={img.page} target="_blank" rel="noreferrer">{img.artist}</a>, {img.license}</span>
      </div>}
      <div className="profile-head">
        <div className="row" style={{ gap: 12 }}>
          <Avatar name={merchant.name} />
          <div><h2>{merchant.name}</h2><small>{isPublic ? `${merchant.category} · ${merchant.street ?? merchant.area}, ${merchant.city}` : `${merchant.ownerName} · Owner · ${merchant.area}, ${merchant.city}`}</small></div>
        </div>
        {isPublic ? <div className="chips2">
          <span>Public listing · OpenStreetMap</span><span>{distanceKm} km away</span>{merchant.cuisine && <span>{merchant.cuisine}</span>}{merchant.openingHours && <span>{merchant.openingHours}</span>}{merchant.brand && <span>Chain: {merchant.brand}</span>}<span>Paytm status: unknown</span><span>Contact: unknown</span>
        </div> : <div className="chips2">
          <span>Paytm verified (demo) · {merchant.mid}</span><span>MCC {merchant.mcc} {merchant.category}</span>{merchant.gstinMasked && <span>GSTIN {merchant.gstinMasked}</span>}<span>QR volume: {merchant.qrVolumeBand}</span><span>{distanceKm} km away</span>{web && <span>{web.rating.toFixed(1)}★ on {web.source}</span>}
        </div>}
      </div>
      <div className="pad lift">
        <div className="card">
          <div className="stage-track">{STAGE_TRACK.map((s, i) => <div key={s} className={`s${i < step ? " done" : i === step ? " now" : ""}`}>{s}</div>)}</div>
          {deal ? <Link href={`/vyapar/deals/${deal.id}`} className="btn btn-wa btn-block btn-sm" style={{ marginTop: 12 }}><MessageCircle />Open Telegram conversation</Link> : <p className="small muted" style={{ marginTop: 10, textAlign: "center" }}>Not pitched yet</p>}
        </div>
        {isPublic && <div className="card stack">
          <div className="card-title">What we actually know</div>
          <div className="small">Real place from OpenStreetMap, observed {merchant.observedAt}. Category, location{merchant.street ? ", street" : ""}{merchant.openingHours ? ", hours" : ""}{merchant.cuisine ? " and cuisine" : ""} come from the map. Paytm status, decision-maker, contact and buying timing are <b>unknown</b>, so Vyapar suggests a visit or an introduction, not a message.</div>
          {merchant.osmId && <a className="link" href={`https://www.openstreetmap.org/${merchant.osmId}`} target="_blank" rel="noreferrer">View on OpenStreetMap ↗</a>}
          <span className="xs muted">Map data © OpenStreetMap contributors, ODbL.</span>
        </div>}
        <div className="card">
          <div className="card-title">What Vyapar AI remembers <ProviderTag provider={isCogneeConfigured() ? "cognee" : "local"} /></div>
          {memories.length === 0 && <div className="empty">Nothing yet. Memory builds as {merchant.ownerName.split(" ")[0]} replies.</div>}
          {memories.map((m) => {
            const st = MEM_STYLE[m.kind] ?? MEM_STYLE.PREFERENCE;
            return <div className="mem-item" key={m.id}>
              <span className={`dotc ${m.resolved ? "b-green" : st.cls}`}>{m.resolved ? <Check /> : <st.Icon />}</span>
              <div className="grow"><b>{m.kind === "OBJECTION" && m.category ? `Objection: ${OBJECTION_LABELS[m.category as Objection]?.toLowerCase()}` : m.kind === "TIMING" ? `Timing: ${m.summary}` : m.kind === "COMMITMENT" ? `Commitment: ${m.summary}` : m.summary}{m.resolved ? " · resolved" : ""}</b>
                {m.quote && <q>{m.quote}</q>}
                <div className="when">{dayLabel(m.createdAt)}, {timeLabel(m.createdAt)}{m.verified ? " · quote verified ✓" : ""}</div></div>
            </div>;
          })}
          {actions.map((a) => <div className="mem-item" key={a.id}><span className="dotc b-cyan">{a.type === "MEETING" ? <CalendarDays /> : <Truck />}</span><div className="grow"><b>{a.summary}</b><div className="when">Task {a.ref} · {a.status} · <ProviderTag provider={a.provider} /></div></div></div>)}
        </div>
        {nodes.length > 1 && <div className="card graph">
          <div className="card-title">Knowledge graph</div>
          <svg viewBox="0 0 320 170" role="img" aria-label="Merchant knowledge graph">
            <g stroke="#cfd8e3" strokeWidth="1.5">{nodes.map((_, i) => <line key={i} x1="160" y1="85" x2={160 + Math.cos(angle(i)) * 115} y2={85 + Math.sin(angle(i)) * 62} />)}</g>
            <g fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle">
              <circle cx="160" cy="85" r="24" fill="#002e6e" /><text x="160" y="88" fill="#fff">{merchant.name.split(" ")[0].slice(0, 9)}</text>
              {nodes.map((n, i) => { const x = 160 + Math.cos(angle(i)) * 115; const y = 85 + Math.sin(angle(i)) * 62; return <g key={i}><rect x={x - 34} y={y - 11} width="68" height="22" rx="11" fill={n.fill} /><text x={x} y={y + 3} fill={n.color}>{n.label.slice(0, 13)}</text></g>; })}
            </g>
          </svg>
        </div>}
        <div className="card stack">
          <div className="card-title">Ask about {merchant.name.split(" ")[0]}</div>
          <AskBox merchantId={merchant.id} placeholder="e.g. What did they object to?" initial="What did they object to?" />
        </div>
      </div>
    </main>
    <VyaparTabs />
  </div>;
}
