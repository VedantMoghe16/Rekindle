import { fail, ok } from "@/lib/api";
import { getCampaignView } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaignView(id);
  return campaign ? ok(campaign) : fail("not_found", "Campaign not found.", 404);
}
