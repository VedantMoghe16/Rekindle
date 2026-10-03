"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Package, Sparkles, Workflow } from "lucide-react";
import { toast } from "@/components/paytm/toast";

type Assets = { inapp: { title: string; subtitle: string; cta: string }; whatsapp: string; instagram: { headline: string; sub: string; caption: string } };

export function CampaignStudio({ objection, headline, assets, audience, handle }: { objection: string; headline: string; assets: Assets; audience: number; handle: string }) {
  const [tab, setTab] = useState<"inapp" | "wa" | "ig">("inapp");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function launch() {
    setBusy(true);
    const res = await fetch("/api/vyapar/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objection }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) { toast(`Campaign ${res.data.provider === "n8n" ? "sent to n8n" : "launched (simulated)"} for ${audience} merchants`); router.refresh(); }
    else toast("Couldn't launch the campaign");
  }
  return <div className="card stack" style={{ gap: 10 }}>
    <div className="row"><span className="ai-chip"><Sparkles />Suggested</span><b className="grow" style={{ fontSize: 13.5, color: "var(--pt-navy)" }}>{headline}</b></div>
    <div className="tabs">{([["inapp", "Paytm in-app"], ["wa", "Telegram broadcast"], ["ig", "Instagram"]] as const).map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === "inapp" && <div className="inapp-offer rise">
      <div className="top"><span className="bx"><Package /></span><div><b>{assets.inapp.title}</b><small>{assets.inapp.subtitle}</small></div></div>
      <div className="bot"><span>Shows in Paytm for Business to {audience} nearby merchants</span><span className="badge b-amber">{assets.inapp.cta}</span></div>
    </div>}
    {tab === "wa" && <div className="wa-preview rise"><div className="bubble out">{assets.whatsapp}<span className="t">Broadcast · {audience}</span></div></div>}
    {tab === "ig" && <div className="ig rise"><div className="img"><div><b>{assets.instagram.headline}</b><small>{assets.instagram.sub}</small></div></div><div className="cap"><b>{handle}</b> {assets.instagram.caption}</div></div>}
    <button className="btn btn-primary btn-block" onClick={launch} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Workflow />}Approve &amp; launch</button>
  </div>;
}
