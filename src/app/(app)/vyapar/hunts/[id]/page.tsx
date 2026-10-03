import { notFound } from "next/navigation";
import { Info, Sparkles } from "lucide-react";
import { AppBar, ProviderTag } from "@/components/paytm/ui";
import { VyaparTabs } from "@/components/paytm/nav";
import { PlanSteps, RevealAfterSteps } from "@/components/vyapar/plan-steps";
import { RadarMap, type Pin } from "@/components/vyapar/radar-map";
import { OpportunityCard, type CardLead } from "@/components/vyapar/opportunity-card";
import { ClarifyCard, PreferencePanel } from "@/components/vyapar/hunt-feedback";
import { ShowMore } from "@/components/vyapar/show-more";
import { OutreachBar } from "@/components/vyapar/outreach-bar";
import { imageFor } from "@/lib/vyapar/images";
import { RANKER_VERSION } from "@/lib/vyapar/opportunity";
import { MERCHANT_CATEGORIES, type MerchantCategory } from "@/lib/vyapar/taxonomy";
import { getHunt } from "@/lib/vyapar/server/hunts";
import type { HuntLead } from "@/lib/vyapar/server/opportunities";

export const dynamic = "force-dynamic";

function card(l: HuntLead): CardLead {
  return { id: l.id, status: l.status, dealId: l.dealId, opp: l.opp, merchant: { id: l.merchant.id, name: l.merchant.name, category: l.merchant.category, area: l.merchant.area, street: l.merchant.street, source: l.merchant.source, image: imageFor(l.merchant.category) } };
}

export default async function HuntPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const [{ id }, { new: fresh }] = await Promise.all([params, searchParams]);
  const hunt = await getHunt(id);
  if (!hunt) notFound();
  const { plan } = hunt;
  const animate = fresh === "1";
  const mccs = [...new Set(plan.categories.map((c) => MERCHANT_CATEGORIES[c as MerchantCategory]?.mcc).filter(Boolean))].join(", ");
  const paytmCount = hunt.shortlist.filter((l) => l.merchant.source !== "osm").length;
  const steps = [
    `Checked ${hunt.scanned} merchants: Paytm network (demo) + OpenStreetMap listings around Andheri`,
    `Matched your catalogue to ${plan.categories.join(" & ").toLowerCase()} (MCC ${mccs}), within ${plan.radiusKm} km`,
    "Ran eligibility gates: delivery range, stock, chains, active deals, capacity",
    "Ordered by relevance, +10 for a fresh dated signal; confidence shown separately",
  ];
  const top = hunt.shortlist.slice(0, 15);
  const pins: Pin[] = [
    ...top.map((l, i) => ({ id: l.id, href: l.dealId ? `/vyapar/deals/${l.dealId}` : `/vyapar/leads/${l.id}`, label: `${l.merchant.name} · relevance ${l.opp.relevance}`, score: l.opp.relevance, x: l.pos.x, y: l.pos.y, state: (l.merchant.source === "osm" ? "pub" : l.opp.timing.status === "fresh" ? "hot" : "warm") as Pin["state"], pulse: i === 0 })),
    ...hunt.inTalks.map((l) => ({ id: l.id, href: l.dealId ? `/vyapar/deals/${l.dealId}` : undefined, label: `${l.merchant.name}: in talks`, score: l.opp.relevance, x: l.pos.x, y: l.pos.y, state: "done" as const })),
    ...hunt.excluded.filter((l) => l.opp.distanceKm <= plan.radiusKm * 1.25).slice(0, 8).map((l) => ({ id: l.id, label: `${l.merchant.name}: ${l.opp.excludedReason}`, score: null, x: l.pos.x, y: l.pos.y, state: "out" as const })),
  ];
  const reasons = [...new Map(hunt.excluded.map((l) => [l.opp.excludedReason?.replace(/^[\d.]+ (km|m) away, /, "").replace(/\(.+\)/, "").trim(), l])).values()].slice(0, 6);

  return <div className="page">
    <AppBar title={`${hunt.shortlist.length} opportunities near you`} sub={`${plan.product} · within ${plan.radiusKm} km · ${paytmCount} on Paytm`} back="/vyapar" />
    <main className="scroll">
      <div className="pad" style={{ paddingBottom: 0 }}>
        <div className="card">
          <div className="row"><span className="ai-chip"><Sparkles />Plan</span><b className="grow" style={{ color: "var(--pt-navy)", fontSize: 13.5 }}>Here&apos;s how I found them</b><ProviderTag provider={hunt.provenance} /></div>
          <p className="small muted" style={{ marginTop: 8 }}>&ldquo;{hunt.prompt}&rdquo;</p>
          <div className="plan-grid">
            <div><small>Buyer types</small><b>{plan.categories.join(", ")}</b></div>
            <div><small>Radius</small><b>{plan.radiusKm} km from you</b></div>
            <div><small>Product</small><b>{plan.product}{plan.unitPriceInr ? ` · ₹${plan.unitPriceInr}` : ""}</b></div>
            <div><small>Pitch in</small><b style={{ textTransform: "capitalize" }}>{plan.language}</b></div>
          </div>
          <PlanSteps steps={steps} animate={animate} />
        </div>
      </div>
      <RevealAfterSteps count={steps.length} animate={animate}>
        <div className="map-wrap" style={{ marginTop: 12 }}>
          <RadarMap pins={pins} radiusKm={plan.radiusKm} />
          <div className="legend"><span><i className="lg hot" />Paytm · why now</span><span><i className="lg warm" />Paytm</span><span><i className="lg pub" />Public map</span><span><i className="lg done" />In talks</span><span><i className="lg out" />Not a fit</span></div>
        </div>
        <div className="pad">
          {hunt.clarification && <ClarifyCard huntId={hunt.id} question={hunt.clarification.question} why={hunt.clarification.why} />}
          <PreferencePanel prefs={hunt.preferences} moved={hunt.moved} />
          {hunt.shortlist.length === 0 && <div className="clarify"><b>No opportunities match your current preferences.</b><span className="small muted">Undo one of your choices above to bring merchants back.</span></div>}
          {top.slice(0, 6).map((l, i) => <OpportunityCard key={l.id} lead={card(l)} top={i === 0} />)}
          {hunt.shortlist.length > 6 && <ShowMore label={`Show ${hunt.shortlist.length - 6} more opportunities`}>
            {hunt.shortlist.slice(6).map((l) => <OpportunityCard key={l.id} lead={card(l)} />)}
          </ShowMore>}
          {hunt.needsCheck.length > 0 && <>
            <div className="sec-title">On hold: answer the question above</div>
            {hunt.needsCheck.map((l) => <OpportunityCard key={l.id} lead={card(l)} />)}
          </>}
          {hunt.inTalks.length > 0 && <>
            <div className="sec-title">Already in talks ({hunt.inTalks.length})</div>
            {hunt.inTalks.slice(0, 4).map((l) => <OpportunityCard key={l.id} lead={card(l)} />)}
          </>}
          {hunt.excluded.length > 0 && <div className="excluded">
            <b style={{ color: "var(--pt-ink)" }}>Not a fit: {hunt.excluded.length} merchants</b>
            {reasons.map((l) => <span key={l.id}>{l.merchant.name}: {l.opp.excludedReason}</span>)}
          </div>}
          <div className="note"><Info size={14} />Ranked by <b>{RANKER_VERSION}</b>, a transparent rules engine (no trained model yet). Paytm merchants are demo fixtures. Public listings are real places from OpenStreetMap (© contributors, ODbL); their Paytm status, contact and buying timing are unknown. Photos are representative, not of the shop.</div>
        </div>
      </RevealAfterSteps>
    </main>
    <OutreachBar huntId={hunt.id} candidates={hunt.shortlist.filter((l) => l.opp.action === "pitch" && !l.dealId).slice(0, 5).map((l) => ({ id: l.id, name: l.merchant.name, category: l.merchant.category, distanceKm: l.opp.distanceKm }))} />
    <VyaparTabs />
  </div>;
}
