import { notFound, redirect } from "next/navigation";
import { AppBar, Avatar } from "@/components/paytm/ui";
import { imageFor } from "@/lib/vyapar/images";
import { PitchComposer } from "@/components/vyapar/pitch-composer";
import { getPitch } from "@/lib/vyapar/server/pitches";

export const dynamic = "force-dynamic";

export default async function PitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPitch(id);
  if (!result) notFound();
  if (result.lead.dealId) redirect(`/vyapar/deals/${result.lead.dealId}`);
  const { merchant, lead, pitch, opp } = result;
  const img = imageFor(merchant.category);
  const isPublic = merchant.source === "osm";
  return <div className="page">
    <AppBar title={`Pitch ${merchant.name}`} sub="Drafted by Vyapar AI · review before sending" back={`/vyapar/hunts/${lead.huntId}`} />
    <div className="target-strip">
      {img ? <span className="avatar" style={{ background: `center / cover url(${img.src})` }} aria-hidden /> : <Avatar name={merchant.name} />}
      <div className="grow"><b>{merchant.name}</b><small>{isPublic ? "Public listing" : merchant.ownerName} · {merchant.category} · {lead.distanceKm} km · {merchant.street ?? merchant.area}</small></div>
      <span className="badge b-green">Relevance {opp.relevance}</span>
    </div>
    <PitchComposer leadId={id} initial={pitch} />
  </div>;
}
