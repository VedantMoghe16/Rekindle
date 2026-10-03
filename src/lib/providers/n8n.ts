/** n8n is the integration bus: campaign publishing to LinkedIn/X, scheduled signal collection, engagement callbacks. */
export function isN8nConfigured() {
  return Boolean(process.env.N8N_CAMPAIGN_WEBHOOK_URL);
}

export function verifyN8nSecret(request: Request): boolean {
  const expected = process.env.N8N_SHARED_SECRET;
  if (!expected) return false;
  return request.headers.get("x-rekindle-secret") === expected;
}

export type PublishAsset = { platform: "linkedin" | "x"; body: string; thread?: string[] };

export async function n8nLaunchCampaign(payload: { campaignId: string; name: string; assets: PublishAsset[]; targetAccounts: { id: string; name: string }[] }) {
  const callbackUrl = `${(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "")}/api/webhooks/n8n`;
  const response = await fetch(process.env.N8N_CAMPAIGN_WEBHOOK_URL!, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rekindle-secret": process.env.N8N_SHARED_SECRET ?? "" },
    body: JSON.stringify({ ...payload, callbackUrl }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`n8n webhook returned ${response.status}`);
  return response.json().catch(() => ({})) as Promise<{ postUrls?: Record<string, string> }>;
}
