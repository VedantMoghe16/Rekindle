"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Bookmark, Check, ChevronDown, CircleHelp, Clock, Globe, LoaderCircle, MapPin, MessageCircle, Send, UserRound, X } from "lucide-react";
import { toast } from "@/components/paytm/toast";
import type { Opportunity } from "@/lib/vyapar/opportunity";
import type { MerchantImage } from "@/lib/vyapar/images";

export type CardLead = {
  id: string; status: string; dealId: string | null;
  merchant: { id: string; name: string; category: string; area: string; street: string | null; source: string; image: MerchantImage | null };
  opp: Opportunity;
};

const SKIPS = [
  { code: "TOO_FAR", label: "Too far to deliver" },
  { code: "TOO_SMALL", label: "Orders too small for me" },
  { code: "CANT_SUPPLY", label: "I can't make what they need" },
  { code: "NOT_RELEVANT", label: "Not relevant / know them" },
];
const KIND: Record<string, string> = { demo: "Demo data", public: "Public", permitted_internal: "Paytm (private)", computed: "Computed", buyer_stated: "Buyer said", seller_stated: "You said" };
const CONF: Record<string, string> = { high: "b-green", medium: "b-cyan", low: "b-grey" };

export function OpportunityCard({ lead, top }: { lead: CardLead; top?: boolean }) {
  const { opp, merchant } = lead;
  const [open, setOpen] = useState(Boolean(top));
  const [skipping, setSkipping] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const isPublic = merchant.source === "osm";

  async function feedback(action: "save" | "skip", reason?: string) {
    setBusy(reason ?? action);
    const res = await fetch(`/api/vyapar/leads/${lead.id}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, reason }) }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    setSkipping(false);
    if (res?.ok) { toast(action === "save" ? "Saved: ranked higher next time" : `Got it: ${res.data.label}`); router.refresh(); }
    else toast("Couldn't save that");
  }

  return <article className={`opp${top ? " top" : ""}`}>
    <div className="opp-head">
      <div className="opp-photo" style={merchant.image ? { backgroundImage: `url(${merchant.image.src})` } : undefined} role="img" aria-label={`Representative photo for ${merchant.category}`}>
        <span className={`src-pill ${isPublic ? "pub" : "demo"}`}>{isPublic ? "Public map" : "Paytm · demo"}</span>
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <h3>{merchant.name} {!isPublic && <BadgeCheck aria-label="Paytm merchant (demo)" />}</h3>
        <div className="meta"><span>{merchant.category}</span><span>· {opp.distanceKm < 1 ? `${Math.round(opp.distanceKm * 1000)} m` : `${opp.distanceKm.toFixed(1)} km`}</span><span>· {merchant.street ?? merchant.area}</span></div>
        <div className="hypo">{opp.hypothesis}</div>
      </div>
    </div>

    <div className="opp-scores">
      <span className="score-chip"><b>{opp.relevance}</b> relevance</span>
      <span className={`badge ${opp.timing.status === "fresh" ? "b-green" : "b-grey"}`}><Clock />{opp.timing.status === "fresh" ? "Why now" : "Timing unknown"}</span>
      <span className={`badge ${CONF[opp.confidence.level]}`}>{opp.confidence.level} confidence</span>
      {lead.status === "SAVED" && <span className="badge b-amber"><Bookmark />Saved</span>}
      {lead.status === "VISIT_PLANNED" && <span className="badge b-navy"><MapPin />Visit planned</span>}
    </div>

    {opp.timing.evidence && <div className={`why-now${opp.timing.evidence.private ? " private" : ""}`}>
      <Clock size={14} /><span className="grow">{opp.timing.evidence.claim}</span>
      <span className="src">{opp.timing.evidence.source} · {opp.timing.evidence.observedAt}{opp.timing.evidence.private ? " · seller-only" : ""}</span>
    </div>}

    <button className="opp-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Hide" : "Show"} evidence, fit and unknowns <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} /></button>
    {open && <div className="opp-body rise">
      <div className="opp-sec"><b>Why this merchant</b>
        {opp.whyMerchant.slice(0, 4).map((e) => <div className="ev" key={e.claim}><Check size={13} /><span className="grow">{e.claim}</span><span className="src">{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.source}</a> : e.source} · {KIND[e.kind]}</span></div>)}
      </div>
      <div className="opp-sec"><b>Can you serve them</b>
        {opp.serve.map((s) => <div className="ev" key={s.label}>{s.ok === true ? <Check size={13} color="var(--pt-green)" /> : s.ok === false ? <X size={13} color="var(--pt-red)" /> : <CircleHelp size={13} color="var(--pt-amber)" />}<span>{s.label}</span></div>)}
      </div>
      <div className="opp-sec"><b>Contact</b>
        <div className="ev">{opp.contact.status === "verified" ? <UserRound size={13} color="var(--pt-green)" /> : <CircleHelp size={13} color="var(--pt-amber)" />}<span>{opp.contact.status === "verified" ? `${opp.contact.name} · ${opp.contact.role} · ${opp.contact.channel}` : opp.contact.note}</span></div>
      </div>
      {opp.unknowns.length > 0 && <div className="opp-sec"><b>Unknown</b>{opp.unknowns.map((u) => <div className="ev" key={u}><CircleHelp size={13} color="var(--pt-amber)" /><span>{u}</span></div>)}</div>}
      <div className="xs muted">{opp.confidence.reasons.join(" · ")}</div>
      {merchant.image && <div className="xs muted">Representative photo: <a href={merchant.image.page} target="_blank" rel="noreferrer">{merchant.image.artist}</a>, {merchant.image.license}</div>}
    </div>}

    {skipping ? <div className="skip-sheet rise">
      <b className="small">Why skip {merchant.name}? Vyapar will adjust your list.</b>
      {SKIPS.map((s) => <button key={s.code} className="btn btn-ghost btn-sm" onClick={() => feedback("skip", s.code)} disabled={busy !== null}>{busy === s.code && <LoaderCircle className="spin" />}{s.label}</button>)}
      <button className="link" onClick={() => setSkipping(false)}>Cancel</button>
    </div> : <div className="actions">
      <button className="btn btn-ghost btn-icon" onClick={() => setSkipping(true)} aria-label="Skip with a reason"><X /></button>
      <button className="btn btn-ghost btn-icon" onClick={() => feedback("save")} disabled={busy !== null || lead.status === "SAVED"} aria-label="Save lead"><Bookmark /></button>
      <Link className="btn btn-ghost" href={`/vyapar/merchants/${merchant.id}`}>{isPublic ? <Globe /> : <UserRound />}Profile</Link>
      {lead.dealId ? <Link className="btn btn-navy" href={`/vyapar/deals/${lead.dealId}`}><MessageCircle />Open chat</Link>
        : opp.action === "visit" ? <Link className="btn btn-primary" href={`/vyapar/leads/${lead.id}`}><MapPin />Plan visit</Link>
        : <Link className="btn btn-primary" href={`/vyapar/leads/${lead.id}`}><Send />Pitch</Link>}
    </div>}
  </article>;
}
