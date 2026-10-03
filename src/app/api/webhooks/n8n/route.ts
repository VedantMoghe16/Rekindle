import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { verifyN8nSecret } from "@/lib/providers/n8n";
import { markPostPublished } from "@/lib/services/campaigns";
import { ENGAGEMENT_TYPES, recordEngagements, resolveAccountId } from "@/lib/services/engagement";

export const dynamic = "force-dynamic";

const Published = z.object({ event: z.literal("post.published"), campaignId: z.string(), platform: z.enum(["linkedin", "x"]), postUrl: z.string().url() });
const EngagementItem = z.object({
  accountId: z.string().optional(), accountDomain: z.string().optional(), companyName: z.string().optional(),
  platform: z.enum(["linkedin", "x"]).default("linkedin"), type: z.enum(ENGAGEMENT_TYPES), roleTitle: z.string().nullish(),
  occurredAt: z.string().optional(),
});
const Engagement = EngagementItem.extend({ event: z.literal("engagement"), campaignId: z.string(), simulated: z.boolean().optional() });
const EngagementBatch = z.object({ event: z.literal("engagement.batch"), campaignId: z.string(), events: z.array(EngagementItem).min(1).max(200), simulated: z.boolean().optional() });
const Payload = z.discriminatedUnion("event", [Published, Engagement, EngagementBatch]);

/** n8n → Rekindle callbacks. Every request must carry x-rekindle-secret = N8N_SHARED_SECRET. */
export async function POST(request: Request) {
  if (!verifyN8nSecret(request)) return fail("unauthorized", "Missing or invalid x-rekindle-secret.", 401);
  const parsed = Payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("invalid_body", parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; "));
  const body = parsed.data;
  try {
    if (body.event === "post.published") {
      return ok({ event: body.event, postUrls: await markPostPublished(body) });
    }
    const items = body.event === "engagement" ? [body] : body.events;
    const events = [];
    const unmatched: string[] = [];
    for (const item of items) {
      const accountId = await resolveAccountId(item);
      if (!accountId) { unmatched.push(item.accountId ?? item.accountDomain ?? item.companyName ?? "unknown"); continue; }
      const occurredAt = item.occurredAt ? new Date(item.occurredAt) : undefined;
      events.push({ accountId, platform: item.platform, type: item.type, roleTitle: item.roleTitle ?? null, occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : undefined });
    }
    if (!events.length) return fail("unknown_account", `No matching account for: ${unmatched.join(", ")}`, 404);
    const result = await recordEngagements(body.campaignId, events, { simulated: body.simulated ?? false });
    return ok({ event: body.event, ...result, unmatched });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed.";
    return fail(message === "Campaign not found." ? "not_found" : "webhook_failed", message, message === "Campaign not found." ? 404 : 500);
  }
}
