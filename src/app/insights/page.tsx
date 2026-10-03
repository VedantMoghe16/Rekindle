import { db } from "@/lib/db";
import { getCampaignView, getObjectionInsights, listCampaigns } from "@/lib/services/campaigns";
import { InsightsWorkspace } from "@/components/insights/insights-workspace";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const [insights, campaigns, seller] = await Promise.all([getObjectionInsights(), listCampaigns(), db.sellerProfile.findFirst()]);
  const initialCampaign = campaigns[0] ? await getCampaignView(campaigns[0].id) : null;
  return <div className="content mk-content">
    <div className="eyebrow">Market from evidence</div>
    <h1>Insights &amp; Campaigns</h1>
    <p className="subtitle">Turn the objections sales hears into campaigns that reach the exact accounts that raised them.</p>
    <InsightsWorkspace initialInsights={insights} initialCampaigns={campaigns} initialCampaign={initialCampaign} sellerName={seller?.name ?? "CloudKavach"} />
  </div>;
}
