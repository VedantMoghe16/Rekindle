import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { runMatcher, type LaneChangeResult } from "@/lib/services/matcher";
import { generateCampaign, latestLaunchedCampaignId, launchCampaign } from "@/lib/services/campaigns";

export const ENGAGEMENT_TYPES = ["view", "click", "like", "comment", "reply"] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];
export type EngagementInput = { accountId: string; platform: "linkedin" | "x" | string; type: EngagementType | string; roleTitle?: string | null; occurredAt?: Date };

// ---------- Pure helpers (unit tested) ----------

/** Counts engagement events per account (insertion order preserved). */
export function countEngagementsByAccount(events: { accountId: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.accountId, (counts.get(event.accountId) ?? 0) + 1);
  return counts;
}

/** The aggregated CAMPAIGN_ENGAGEMENT signal for one account and campaign; `events` is the cumulative count the matcher scores. */
export function buildEngagementSignal(input: { campaignId: string; accountId: string; events: number; campaignCategory: string; coreMessage: string; simulated: boolean }) {
  const message = input.coreMessage.replace(/[.\s]+$/, "");
  return {
    dedupeKey: `campaign:${input.campaignId}:${input.accountId}`,
    type: "CAMPAIGN_ENGAGEMENT" as const,
    title: `${input.events} ${input.events === 1 ? "engagement" : "engagements"} with “${message}”`,
    detail: `${input.events} people at this account engaged with the campaign that answers their ${input.campaignCategory.toLowerCase().replaceAll("_", " ")} objection.`,
    sourceName: "Campaign",
    provenance: input.simulated ? "simulated" : "live",
    rawJson: JSON.stringify({ events: input.events, campaignCategory: input.campaignCategory, coreMessage: input.coreMessage }),
  };
}

export type PlanStep = { accountId: string; platform: "linkedin" | "x"; type: EngagementType; roleTitle: string };

/** Spec §12.2 default plan: Tripnest ×3, Zestcart ×3, Edunova ×1. */
export const DEFAULT_ENGAGEMENT_PLAN: PlanStep[] = [
  { accountId: "account-tripnest", platform: "linkedin", type: "like", roleTitle: "Head of Engineering" },
  { accountId: "account-tripnest", platform: "linkedin", type: "comment", roleTitle: "VP Engineering" },
  { accountId: "account-tripnest", platform: "x", type: "click", roleTitle: "Platform Lead" },
  { accountId: "account-zestcart", platform: "linkedin", type: "like", roleTitle: "CTO" },
  { accountId: "account-zestcart", platform: "linkedin", type: "click", roleTitle: "Engineering Manager" },
  { accountId: "account-zestcart", platform: "x", type: "reply", roleTitle: "DevOps Engineer" },
  { accountId: "account-edunova", platform: "linkedin", type: "view", roleTitle: "Engineering Manager" },
];

/** Keeps only plan steps whose account is a target of the campaign. */
export function planForTargets(plan: PlanStep[], targetAccountIds: string[]): PlanStep[] {
  const targets = new Set(targetAccountIds);
  return plan.filter((step) => targets.has(step.accountId));
}

/** Collapses sequential lane changes per deal into one first-from → last-to change, dropping no-ops. */
export function mergeLaneChanges(changes: LaneChangeResult[]): LaneChangeResult[] {
  const merged = new Map<string, LaneChangeResult>();
  for (const change of changes) {
    const existing = merged.get(change.dealId);
    merged.set(change.dealId, existing ? { ...change, fromLane: existing.fromLane } : change);
  }
  return [...merged.values()].filter((change) => change.fromLane !== change.toLane);
}

// ---------- Persistence ----------

export async function recordEngagements(campaignId: string, events: EngagementInput[], options: { simulated: boolean }) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found.");
  const created = [];
  for (const event of events) {
    created.push(await db.engagementEvent.create({ data: {
      campaignId, accountId: event.accountId, platform: event.platform, type: event.type,
      roleTitle: event.roleTitle ?? null, occurredAt: event.occurredAt ?? now(), isSimulated: options.simulated,
    } }));
  }
  const affected = [...countEngagementsByAccount(events).keys()];
  for (const accountId of affected) {
    const total = await db.engagementEvent.count({ where: { campaignId, accountId } });
    const signal = buildEngagementSignal({ campaignId, accountId, events: total, campaignCategory: campaign.stallCategory, coreMessage: campaign.coreMessage, simulated: options.simulated });
    await db.signal.upsert({
      where: { dedupeKey: signal.dedupeKey },
      create: { id: `signal-${randomUUID()}`, accountId, ...signal, occurredAt: now() },
      update: { title: signal.title, detail: signal.detail, rawJson: signal.rawJson, occurredAt: now(), provenance: signal.provenance, stale: false },
    });
  }
  const deals = await db.deal.findMany({ where: { accountId: { in: affected }, stage: { notIn: ["won", "lost"] } }, select: { id: true } });
  const laneChanges = deals.length ? await runMatcher({ dealIds: deals.map((deal) => deal.id) }) : [];
  const accounts = await db.account.findMany({ where: { id: { in: affected } }, select: { id: true, name: true } });
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  return {
    events: created.map((event) => ({ id: event.id, accountId: event.accountId, accountName: names.get(event.accountId) ?? event.accountId, platform: event.platform, type: event.type, roleTitle: event.roleTitle })),
    laneChanges,
  };
}

/** Resolves an n8n engagement payload to an account by id, domain or company name. */
export async function resolveAccountId(input: { accountId?: string; accountDomain?: string; companyName?: string }): Promise<string | null> {
  if (input.accountId) {
    const account = await db.account.findUnique({ where: { id: input.accountId }, select: { id: true } });
    if (account) return account.id;
  }
  const accounts = await db.account.findMany({ select: { id: true, name: true, domain: true } });
  const domain = input.accountDomain?.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (domain) {
    const match = accounts.find((account) => account.domain?.toLowerCase().replace(/^www\./, "") === domain);
    if (match) return match.id;
  }
  const name = input.companyName?.trim().toLowerCase();
  if (name) {
    const match = accounts.find((account) => account.name.toLowerCase() === name);
    if (match) return match.id;
  }
  return null;
}

/** Demo Controls: apply the default engagement plan to a launched campaign (auto-creating the Implementation-effort campaign if needed). */
export async function simulateEngagement(input: { campaignId?: string } = {}) {
  const launchChanges: LaneChangeResult[] = [];
  let campaignId = input.campaignId ?? await latestLaunchedCampaignId();
  let autoLaunched = false;
  if (!campaignId) {
    const draft = await db.campaign.findFirst({ where: { stallCategory: "IMPLEMENTATION_EFFORT", status: "draft" }, orderBy: { createdAt: "desc" } });
    const id = draft?.id ?? (await generateCampaign({ stallCategory: "IMPLEMENTATION_EFFORT" })).id;
    const launched = await launchCampaign(id, { forceSimulated: true });
    launchChanges.push(...launched.laneChanges);
    campaignId = id;
    autoLaunched = true;
  }
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status === "draft") throw new Error("Launch the campaign before simulating engagement.");
  const steps = planForTargets(DEFAULT_ENGAGEMENT_PLAN, JSON.parse(campaign.targetAccountIdsJson) as string[]);
  const result = steps.length ? await recordEngagements(campaign.id, steps, { simulated: true }) : { events: [], laneChanges: [] };
  return {
    campaign: { id: campaign.id, name: campaign.name, coreMessage: campaign.coreMessage, stallCategory: campaign.stallCategory },
    autoLaunched,
    events: result.events.map((event) => ({ accountName: event.accountName, accountId: event.accountId, type: event.type, roleTitle: event.roleTitle, platform: event.platform })),
    laneChanges: mergeLaneChanges([...launchChanges, ...result.laneChanges]),
    note: steps.length ? undefined : "None of the default plan accounts (Tripnest, Zestcart, Edunova) are targets of this campaign.",
  };
}
