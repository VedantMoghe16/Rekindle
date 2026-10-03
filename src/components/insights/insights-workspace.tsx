"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Megaphone, RefreshCw, Rocket, Sparkles, X as Close, Zap } from "lucide-react";
import { formatINR, formatShortDate } from "@/lib/format";
import type { ObjectionGroup } from "@/lib/engines/insights";
import type { CampaignView } from "@/lib/services/campaigns";
import { ObjectionChart } from "@/components/insights/objection-chart";

type Insights = { groups: ObjectionGroup[]; totals: { deals: number; valueInr: number; objectionsCaptured: number; campaignsLive: number } };
type CampaignSummary = { id: string; name: string; coreMessage: string; stallCategory: string; categoryLabel: string; status: string; recommendedPlatform: string; provenance: string; targets: number; events: number; createdAt: string; launchedAt: string | null };
type LaneChange = { dealId: string; accountName: string; fromLane: string; toLane: string; reason: string };
type PublishPlatform = "linkedin" | "x";
type AssetTab = "linkedin" | "x" | "email" | "landing";

const PLATFORM_NAMES: Record<string, string> = { linkedin: "LinkedIn", x: "X", email: "Email nurture" };
const LANE_NAMES: Record<string, string> = { REVIVE: "Revive now", WARM: "Warming up", WATCH: "Watching" };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error?.message ?? "Request failed");
  return body.data as T;
}

function LaneChip({ lane }: { lane: string }) {
  return <span className={`lane ${lane.toLowerCase()}`}>{lane}</span>;
}

function statusLabel(status: string) {
  if (status === "launched") return "Launched via n8n";
  if (status === "launched_simulated") return "Launched · Simulated";
  return "Draft";
}

function provenanceLabel(provenance: string) {
  if (provenance === "live") return "Claude";
  if (provenance === "cached") return "Cached";
  return "Template";
}

function defaultPlatforms(campaign: CampaignView): PublishPlatform[] {
  const picks = [campaign.recommendedPlatform, campaign.secondaryPlatform].filter((value): value is PublishPlatform => value === "linkedin" || value === "x");
  return picks.length ? [...new Set(picks)] : ["linkedin"];
}

function campaignText(campaign: CampaignView) {
  const { assets } = campaign;
  return [
    `CAMPAIGN: ${campaign.name}`,
    `CORE MESSAGE: ${campaign.coreMessage}`,
    "",
    "LINKEDIN POST",
    assets.linkedin_post,
    "",
    "X THREAD",
    ...assets.x_thread.map((post, index) => `${index + 1}/${assets.x_thread.length} ${post}`),
    "",
    "NURTURE EMAIL",
    `Subject: ${assets.nurture_email.subject}`,
    assets.nurture_email.body,
    "",
    "LANDING HERO",
    assets.landing_hero.headline,
    assets.landing_hero.subhead,
    `[${assets.landing_hero.cta}]`,
  ].join("\n");
}

export function InsightsWorkspace({ initialInsights, initialCampaigns, initialCampaign, sellerName }: { initialInsights: Insights; initialCampaigns: CampaignSummary[]; initialCampaign: CampaignView | null; sellerName: string }) {
  const [insights, setInsights] = useState(initialInsights);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [campaign, setCampaign] = useState<CampaignView | null>(initialCampaign);
  const [selected, setSelected] = useState<string | null>(initialCampaign?.stallCategory ?? initialInsights.groups[0]?.category ?? null);
  const [busy, setBusy] = useState<"" | "generate" | "regenerate" | "launch" | "simulate" | "load">("");
  const [error, setError] = useState("");
  const [n8nLive, setN8nLive] = useState<boolean | null>(null);
  const [laneChanges, setLaneChanges] = useState<LaneChange[]>([]);
  const [launchWarning, setLaunchWarning] = useState("");

  useEffect(() => {
    fetch("/api/demo/status").then((response) => response.json()).then((body) => setN8nLive(Boolean(body?.data?.providers?.n8n?.live))).catch(() => setN8nLive(false));
  }, []);

  const group = useMemo(() => insights.groups.find((item) => item.category === selected) ?? null, [insights, selected]);
  const top = insights.groups[0];

  async function refreshInsights() {
    const [nextInsights, nextCampaigns] = await Promise.all([api<Insights>("/api/insights/objections"), api<CampaignSummary[]>("/api/campaigns")]);
    setInsights(nextInsights);
    setCampaigns(nextCampaigns);
  }

  async function openCampaign(id: string) {
    setBusy("load"); setError("");
    try {
      const view = await api<CampaignView>(`/api/campaigns/${id}`);
      setCampaign(view); setSelected(view.stallCategory); setLaneChanges([]); setLaunchWarning("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open the campaign."); }
    setBusy("");
  }

  function select(category: string) {
    setSelected(category); setError("");
    if (campaign?.stallCategory === category) return;
    const existing = campaigns.find((item) => item.stallCategory === category);
    if (existing) void openCampaign(existing.id);
    else { setCampaign(null); setLaneChanges([]); setLaunchWarning(""); }
  }

  async function generate(regenerateFrom?: string) {
    if (!selected) return;
    setBusy(regenerateFrom ? "regenerate" : "generate"); setError("");
    try {
      const view = await api<CampaignView>("/api/campaigns", { method: "POST", body: JSON.stringify({ stallCategory: selected, regenerateFrom }) });
      setCampaign(view); setLaneChanges([]); setLaunchWarning("");
      await refreshInsights();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate the campaign."); }
    setBusy("");
  }

  async function launch(platforms: PublishPlatform[]) {
    if (!campaign) return;
    setBusy("launch"); setError("");
    try {
      const result = await api<{ campaign: CampaignView; laneChanges: LaneChange[]; mode: string; warning?: string }>(`/api/campaigns/${campaign.id}/launch`, { method: "POST", body: JSON.stringify({ platforms }) });
      setCampaign(result.campaign); setLaneChanges(result.laneChanges); setLaunchWarning(result.warning ?? "");
      await refreshInsights();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Launch failed."); }
    setBusy("");
  }

  async function simulate() {
    if (!campaign) return;
    setBusy("simulate"); setError("");
    try {
      const result = await api<{ laneChanges: LaneChange[] }>("/api/demo/simulate-engagement", { method: "POST", body: JSON.stringify({ campaignId: campaign.id }) });
      setLaneChanges(result.laneChanges);
      setCampaign(await api<CampaignView>(`/api/campaigns/${campaign.id}`));
      await refreshInsights();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Simulation failed."); }
    setBusy("");
  }

  return <div className="mk-workspace">
    <section className="kpis">
      <div className="kpi"><span className="kpi-label">Objections captured</span><strong className="kpi-value">{insights.totals.objectionsCaptured}</strong><span className="kpi-note">from {insights.totals.deals} stalled deals · {formatINR(insights.totals.valueInr)}</span></div>
      <div className="kpi"><span className="kpi-label">Top objection</span><strong className="kpi-value">{top ? `${Math.round(top.share * 100)}%` : "—"}</strong><span className="kpi-note">{top ? `${top.label} · ${top.count} deals` : "No objections yet"}</span></div>
      <div className="kpi"><span className="kpi-label">₹ blocked by top objection</span><strong className="kpi-value">{top ? formatINR(top.valueInr) : "—"}</strong><span className="kpi-note">{top ? `${Math.round((top.valueInr / Math.max(insights.totals.valueInr, 1)) * 100)}% of stalled pipeline` : ""}</span></div>
      <div className="kpi"><span className="kpi-label">Campaigns live</span><strong className="kpi-value">{insights.totals.campaignsLive}</strong><span className="kpi-note">{campaigns.length} generated · n8n {n8nLive === null ? "…" : n8nLive ? "live" : "simulated"}</span></div>
    </section>

    <div className="mk-grid">
      <section className="panel mk-chart-panel">
        <div className="mk-panel-head">
          <div><h2>What&apos;s stopping your deals</h2><p className="meta">From {insights.totals.deals} stalled conversations · deal count with ₹ value · click a bar</p></div>
        </div>
        {insights.groups.length ? <ObjectionChart groups={insights.groups} selected={selected} onSelect={select} /> : <p className="subtitle">Capture a conversation to see objections here.</p>}
        <details className="mk-table-toggle">
          <summary>View as table</summary>
          <table className="account-table">
            <thead><tr><th>Objection</th><th>Deals</th><th>Share</th><th>Pipeline</th></tr></thead>
            <tbody>{insights.groups.map((item) => <tr key={item.category}><td>{item.label}</td><td>{item.count}</td><td>{Math.round(item.share * 100)}%</td><td>{formatINR(item.valueInr)}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      {group && <section className="panel mk-objection">
        <div className="eyebrow">{group.label}</div>
        <h2 className="mk-objection-headline">{group.count} of {insights.totals.deals} stalled deals blame {group.label.toLowerCase()} · {formatINR(group.valueInr)}</h2>
        <p className="meta">{Math.round(group.share * 100)}% of stalled deals · {Object.entries(group.lanes).map(([lane, count]) => `${count} ${LANE_NAMES[lane]?.toLowerCase() ?? lane}`).join(" · ")}</p>
        <div className="field-label mk-gap">In their words</div>
        <div className="mk-quotes">
          {group.quotes.map((quote) => <figure key={quote.accountId} className="mk-quote">
            <blockquote>“{quote.quote}”</blockquote>
            <figcaption>{quote.title ?? quote.speaker ?? "Buyer"} · {quote.company}{quote.date ? ` · ${formatShortDate(quote.date)}` : ""} <span className="badge demo">Demo data</span></figcaption>
          </figure>)}
        </div>
        <div className="field-label mk-gap">Accounts</div>
        <div className="mk-chips">{group.accounts.map((account) => <a key={account.dealId} href={`/accounts/${account.accountId}`} className={`mk-chip ${account.lane.toLowerCase()}`} title={`${LANE_NAMES[account.lane] ?? account.lane} · ${formatINR(account.valueInr)}`}><span className="mk-dot" />{account.name}<span className="mk-chip-lane">{account.lane}</span></a>)}</div>
        {(!campaign || campaign.stallCategory !== group.category) && <button className="button primary mk-gap" disabled={Boolean(busy)} onClick={() => generate()}>
          <Sparkles /> {busy === "generate" ? "Writing campaign from these objections…" : "Generate campaign"}
        </button>}
      </section>}
    </div>

    {error && <p className="error">{error}</p>}
    {busy === "load" && <p className="meta">Opening campaign…</p>}

    {campaign && <CampaignPanel
      key={campaign.id}
      campaign={campaign}
      sellerName={sellerName}
      n8nLive={n8nLive}
      busy={busy}
      laneChanges={laneChanges}
      launchWarning={launchWarning}
      onRegenerate={() => generate(campaign.status === "draft" ? campaign.id : undefined)}
      onLaunch={launch}
      onSimulate={simulate}
    />}

    {campaigns.length > 0 && <section>
      <div className="section-head"><div><h2>Campaigns</h2><p>Every campaign generated from sales objections</p></div></div>
      <div className="mk-campaign-list">
        {campaigns.map((item) => <button key={item.id} className={`mk-campaign-row${campaign?.id === item.id ? " active" : ""}`} onClick={() => openCampaign(item.id)}>
          <div><strong>{item.name}</strong><div className="meta">{item.categoryLabel} · “{item.coreMessage}”</div></div>
          <div className="mk-row-meta"><span className={`mk-status ${item.status}`}>{statusLabel(item.status)}</span><span className="meta">{PLATFORM_NAMES[item.recommendedPlatform] ?? item.recommendedPlatform} · {item.targets} targets · {item.events} engagements</span></div>
        </button>)}
      </div>
    </section>}
  </div>;
}

function CampaignPanel({ campaign, sellerName, n8nLive, busy, laneChanges, launchWarning, onRegenerate, onLaunch, onSimulate }: {
  campaign: CampaignView; sellerName: string; n8nLive: boolean | null; busy: string; laneChanges: LaneChange[]; launchWarning: string;
  onRegenerate: () => void; onLaunch: (platforms: PublishPlatform[]) => void; onSimulate: () => void;
}) {
  const [tab, setTab] = useState<AssetTab>(campaign.recommendedPlatform === "x" ? "x" : campaign.recommendedPlatform === "email" ? "email" : "linkedin");
  const [confirming, setConfirming] = useState(false);
  const [platforms, setPlatforms] = useState<PublishPlatform[]>(defaultPlatforms(campaign));
  const [copied, setCopied] = useState(false);
  const launched = campaign.status !== "draft";
  const initials = (sellerName.match(/[A-Z]/g)?.slice(0, 2).join("") || sellerName.slice(0, 2)).toUpperCase();
  const { assets } = campaign;

  async function copyAll() {
    try { await navigator.clipboard.writeText(campaignText(campaign)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); }
  }
  function toggle(platform: PublishPlatform) {
    setPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);
  }

  return <section className="panel mk-campaign">
    <div className="mk-campaign-head">
      <div>
        <div className="eyebrow">Campaign · {campaign.categoryLabel}</div>
        <h2 className="mk-campaign-name">{campaign.name}</h2>
        <div className="mk-badges">
          <span className={`mk-status ${campaign.status}`}>{statusLabel(campaign.status)}</span>
          <span className={`badge mk-prov ${campaign.provenance}`} title={campaign.model ?? "Pre-written fallback built only from seller proof points"}>{provenanceLabel(campaign.provenance)}</span>
          <span className={`badge ${n8nLive ? "mk-live" : "demo"}`}>n8n · {n8nLive === null ? "…" : n8nLive ? "Live" : "Simulated"}</span>
          {campaign.violations.length > 0 && <span className="badge mk-warn" title={campaign.violations.join("\n")}>{campaign.violations.length} guardrail warnings</span>}
        </div>
      </div>
      <div className="card-actions">
        {!launched && <button className="button" disabled={Boolean(busy)} onClick={onRegenerate}><RefreshCw /> {busy === "regenerate" ? "Regenerating…" : "Regenerate"}</button>}
        <button className="button" onClick={copyAll}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy all"}</button>
        {!launched && <button className="button primary" disabled={Boolean(busy)} onClick={() => setConfirming(true)}><Rocket /> Approve and launch</button>}
        {launched && <button className="button" disabled={Boolean(busy)} onClick={onSimulate} title="Demo control: Tripnest ×3, Zestcart ×3, Edunova ×1"><Zap /> {busy === "simulate" ? "Simulating…" : "Simulate engagement"}</button>}
      </div>
    </div>

    <p className="mk-core">{campaign.coreMessage}</p>

    <div className="mk-why-grid">
      <div className="mk-why"><div className="field-label">Why this message</div><p>{campaign.rationale}</p></div>
      <div className="mk-channel">
        <div className="field-label">Recommended channel</div>
        <div className="mk-channel-name"><Megaphone /> {PLATFORM_NAMES[campaign.recommendedPlatform] ?? campaign.recommendedPlatform}<span className="meta">then {PLATFORM_NAMES[campaign.secondaryPlatform] ?? campaign.secondaryPlatform}</span></div>
        <p>{campaign.platformRationale}</p>
      </div>
    </div>

    {confirming && !launched && <div className="mk-confirm" role="dialog" aria-label="Confirm launch">
      <div className="mk-confirm-head">
        <div>
          <strong>Approve exactly what will be published</strong>
          <p className="meta">{n8nLive ? "n8n is connected: approving publishes these posts for real on the selected accounts." : "n8n is not configured: nothing is posted publicly. The launch is simulated and the matcher still updates target accounts."}</p>
        </div>
        <button className="button" onClick={() => setConfirming(false)} aria-label="Cancel"><Close /></button>
      </div>
      <div className="mk-confirm-grid">
        <label className={`mk-confirm-item${platforms.includes("linkedin") ? " on" : ""}`}>
          <span><input type="checkbox" checked={platforms.includes("linkedin")} onChange={() => toggle("linkedin")} /> LinkedIn · 1 post · {assets.linkedin_post.length} chars</span>
          <pre>{assets.linkedin_post}</pre>
        </label>
        <label className={`mk-confirm-item${platforms.includes("x") ? " on" : ""}`}>
          <span><input type="checkbox" checked={platforms.includes("x")} onChange={() => toggle("x")} /> X · thread of {assets.x_thread.length} posts</span>
          <pre>{assets.x_thread.map((post, index) => `${index + 1}/${assets.x_thread.length}  ${post}`).join("\n\n")}</pre>
        </label>
      </div>
      <p className="meta">The campaign also targets {campaign.targets.length} stalled accounts for sales follow-up. Public posts never name them.</p>
      <div className="card-actions">
        <button className="button primary" disabled={!platforms.length || Boolean(busy)} onClick={() => { onLaunch(platforms); setConfirming(false); }}>
          <Rocket /> {busy === "launch" ? "Launching…" : `${n8nLive ? "Publish" : "Launch (simulated)"} to ${platforms.map((item) => PLATFORM_NAMES[item]).join(" + ") || "…"}`}
        </button>
        <button className="button" onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    </div>}

    {launched && <div className="mk-launched">
      <div className="mk-stats">
        <div><span className="kpi-label">Targets</span><strong>{campaign.stats.targets}</strong></div>
        <div><span className="kpi-label">Engaged accounts</span><strong>{campaign.stats.engagedAccounts}</strong></div>
        <div><span className="kpi-label">Engagements</span><strong>{campaign.stats.events}</strong></div>
        <div><span className="kpi-label">Moved to Revive</span><strong>{campaign.stats.movedToRevive}</strong></div>
        <div><span className="kpi-label">Pipeline influenced</span><strong>{formatINR(campaign.stats.pipelineInfluencedInr)}</strong></div>
      </div>
      <div className="mk-posts">
        {Object.entries(campaign.postUrls).map(([platform, url]) => <a key={platform} href={url} target="_blank" rel="noreferrer" className="mk-post-link"><ExternalLink /> {PLATFORM_NAMES[platform] ?? platform} post{url.includes("simulated-") ? " (simulated)" : ""}</a>)}
        {Object.keys(campaign.postUrls).length === 0 && <span className="meta">Waiting for n8n to report post URLs…</span>}
        {campaign.launchedAt && <span className="meta">Launched {formatShortDate(campaign.launchedAt)} · {campaign.launchPlatforms.map((item) => PLATFORM_NAMES[item]).join(" + ")}</span>}
      </div>
      {(launchWarning || campaign.warning) && <p className="error">{launchWarning || campaign.warning}</p>}
      {laneChanges.length > 0 && <div className="mk-lane-changes">
        <div className="field-label">Lane changes</div>
        {laneChanges.map((change) => <div key={change.dealId} className="mk-lane-change">
          <strong>{change.accountName}</strong> <LaneChip lane={change.fromLane} /> → <LaneChip lane={change.toLane} /> <span className="meta">{change.reason}</span>
        </div>)}
      </div>}
    </div>}

    <div className="mk-assets">
      <div className="mk-tabs" role="tablist">
        {([["linkedin", "LinkedIn post"], ["x", `X thread · ${assets.x_thread.length}`], ["email", "Nurture email"], ["landing", "Landing hero"]] as [AssetTab, string][]).map(([key, label]) =>
          <button key={key} role="tab" aria-selected={tab === key} className={`mk-tab${tab === key ? " active" : ""}`} onClick={() => setTab(key)}>{label}{key === campaign.recommendedPlatform && <span className="mk-rec">Recommended</span>}</button>)}
      </div>
      <div className="mk-tab-body">
        {tab === "linkedin" && <div className="mk-li">
          <div className="mk-li-head"><span className="mk-avatar">{initials}</span><div><strong>{sellerName}</strong><div className="meta">Company page · now</div></div></div>
          <div className="mk-li-body">{assets.linkedin_post}</div>
          <div className="mk-li-foot"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span><span className={`mk-count${assets.linkedin_post.length > 1200 ? " over" : ""}`}>{assets.linkedin_post.length} / 1,200</span></div>
        </div>}
        {tab === "x" && <ol className="mk-thread">
          {assets.x_thread.map((post, index) => <li key={index} className="mk-tweet">
            <span className="mk-avatar small">{initials}</span>
            <div><div><strong>{sellerName}</strong> <span className="meta">@{sellerName.toLowerCase().replace(/[^a-z0-9]/g, "")} · {index + 1}/{assets.x_thread.length}</span></div><p>{post}</p><span className={`mk-count${post.length > 280 ? " over" : ""}`}>{post.length} / 280</span></div>
          </li>)}
        </ol>}
        {tab === "email" && <div className="mk-email">
          <div className="mk-email-row"><span className="field-label">Subject</span> {assets.nurture_email.subject}</div>
          <div className="mk-email-body">{assets.nurture_email.body}</div>
          <div className="meta">{assets.nurture_email.body.trim().split(/\s+/).length} / 150 words · sent 1:1 by the rep, never as a blast</div>
        </div>}
        {tab === "landing" && <div className="mk-hero">
          <div className="mk-hero-nav"><strong>{sellerName}</strong><span>Product</span><span>Customers</span><span>Pricing</span></div>
          <h3>{assets.landing_hero.headline}</h3>
          <p>{assets.landing_hero.subhead}</p>
          <span className="mk-hero-cta">{assets.landing_hero.cta}</span>
        </div>}
      </div>
      {assets.angle_tags.length > 0 && <div className="chip-row">{assets.angle_tags.map((tag) => <span key={tag} className="criteria-chip">{tag}</span>)}</div>}
    </div>

    <div className="mk-targets">
      <div className="field-label">Target audience · {campaign.targets.length} stalled accounts that raised this objection</div>
      <table className="account-table">
        <thead><tr><th>Account</th><th>Contact</th><th>Pipeline</th><th>Engagements</th><th>Lane</th></tr></thead>
        <tbody>{campaign.targets.map((target) => <tr key={target.accountId}>
          <td><a href={`/accounts/${target.accountId}`}><strong>{target.name}</strong></a><div className="meta">{target.industry}</div></td>
          <td>{target.contactTitle ?? "—"}</td>
          <td>{formatINR(target.valueInr)}</td>
          <td>{target.engagements}</td>
          <td><LaneChip lane={target.lane} /></td>
        </tr>)}</tbody>
      </table>
      <p className="meta">LinkedIn matched audiences need a minimum audience size; in production we would group accounts or add look-alikes.</p>
    </div>
  </section>;
}
