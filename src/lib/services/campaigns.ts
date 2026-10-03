import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { formatINR } from "@/lib/format";
import { CampaignDraft, StallCategory } from "@/lib/schemas";
import { callStructured } from "@/lib/providers/llm";
import { isN8nConfigured, n8nLaunchCampaign, type PublishAsset } from "@/lib/providers/n8n";
import { runMatcher, type LaneChangeResult } from "@/lib/services/matcher";
import { aggregateObjections, anonymiseQuote, categoryLabel, type ObjectionGroup, type ObjectionRow } from "@/lib/engines/insights";
import { recommendPlatform, templateCampaign, templateVariantCount, validateCampaignAssets, type Platform } from "@/lib/engines/campaign-strategy";
import { buildCampaignUserPrompt, CAMPAIGN_SYSTEM } from "@/lib/prompts/campaign";

const CLOSED = ["won", "lost"];
const LAUNCHED = ["launched", "launched_simulated"];

export type CampaignProvenance = "live" | "cached" | "template";
export type PublishPlatform = "linkedin" | "x";

type StoredAssets = {
  draft: CampaignDraft;
  secondaryPlatform: Platform;
  variant: number;
  violations: string[];
  model: string | null;
  launchPlatforms?: PublishPlatform[];
  warning?: string;
  /** Wall-clock launch time. launchedAt follows the demo clock (DEMO_TODAY), but LaneChange.createdAt is real time. */
  launchedWallClock?: string;
};

// ---------- Insights ----------

async function openDealRows(): Promise<{ rows: ObjectionRow[]; people: string[] }> {
  const deals = await db.deal.findMany({
    where: { stage: { notIn: CLOSED }, memory: { isNot: null } },
    include: { memory: true, account: { include: { contacts: true } } },
  });
  const people = deals.flatMap((deal) => [...deal.account.contacts.map((contact) => contact.name), deal.memory?.evidenceSpeaker ?? ""]).filter(Boolean);
  const rows = deals.map((deal) => {
    const memory = deal.memory!;
    const contact = deal.account.contacts.find((item) => item.name === memory.evidenceSpeaker) ?? deal.account.contacts[0];
    return {
      dealId: deal.id, accountId: deal.accountId, accountName: deal.account.name, industry: deal.account.industry,
      valueInr: deal.valueInr, lane: deal.lane, stallCategory: memory.stallCategory, quote: memory.evidenceQuote,
      speaker: memory.evidenceSpeaker ?? contact?.name ?? null, title: contact?.title ?? null, date: memory.evidenceDate ?? deal.stalledAt,
    };
  });
  return { rows, people };
}

export async function getObjectionInsights() {
  const [{ rows }, campaignsLive] = await Promise.all([openDealRows(), db.campaign.count({ where: { status: { in: LAUNCHED } } })]);
  const groups = aggregateObjections(rows);
  return {
    groups,
    totals: {
      deals: rows.length,
      valueInr: rows.reduce((sum, row) => sum + row.valueInr, 0),
      objectionsCaptured: rows.filter((row) => row.quote.trim()).length,
      campaignsLive,
    },
  };
}

// ---------- View model ----------

export type CampaignTarget = { accountId: string; name: string; dealId: string | null; lane: string; valueInr: number; contactTitle: string | null; industry: string | null; engagements: number };
export type CampaignStats = { targets: number; engagedAccounts: number; events: number; movedToRevive: number; pipelineInfluencedInr: number };
export type CampaignView = {
  id: string; stallCategory: string; categoryLabel: string; name: string; coreMessage: string; rationale: string;
  recommendedPlatform: Platform; secondaryPlatform: Platform; platformRationale: string;
  assets: Pick<CampaignDraft, "linkedin_post" | "x_thread" | "nurture_email" | "landing_hero" | "angle_tags">;
  status: string; launchedAt: string | null; createdAt: string; postUrls: Record<string, string>; provenance: string; model: string | null;
  launchPlatforms: PublishPlatform[]; warning: string | null; violations: string[];
  targets: CampaignTarget[]; stats: CampaignStats;
};

function parseAssets(json: string): StoredAssets {
  return JSON.parse(json) as StoredAssets;
}

export async function getCampaignView(id: string): Promise<CampaignView | null> {
  const campaign = await db.campaign.findUnique({ where: { id }, include: { engagements: true } });
  if (!campaign) return null;
  const stored = parseAssets(campaign.assetsJson);
  const targetIds = JSON.parse(campaign.targetAccountIdsJson) as string[];
  const accounts = await db.account.findMany({ where: { id: { in: targetIds } }, include: { contacts: true, deals: { where: { stage: { notIn: CLOSED } } } } });
  const engagementsByAccount = new Map<string, number>();
  for (const event of campaign.engagements) engagementsByAccount.set(event.accountId, (engagementsByAccount.get(event.accountId) ?? 0) + 1);
  const targets: CampaignTarget[] = targetIds.flatMap((accountId) => {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return [];
    const deal = account.deals[0];
    return [{ accountId, name: account.name, dealId: deal?.id ?? null, lane: deal?.lane ?? "WATCH", valueInr: account.deals.reduce((sum, item) => sum + item.valueInr, 0), contactTitle: account.contacts[0]?.title ?? null, industry: account.industry, engagements: engagementsByAccount.get(accountId) ?? 0 }];
  });
  const targetDealIds = accounts.flatMap((account) => account.deals.map((deal) => deal.id));
  const since = stored.launchedWallClock ? new Date(stored.launchedWallClock) : campaign.launchedAt;
  const movedToRevive = since
    ? new Set((await db.laneChange.findMany({ where: { dealId: { in: targetDealIds }, toLane: "REVIVE", createdAt: { gte: since } }, select: { dealId: true } })).map((row) => row.dealId)).size
    : 0;
  const engaged = targets.filter((target) => target.engagements > 0);
  return {
    id: campaign.id, stallCategory: campaign.stallCategory, categoryLabel: categoryLabel(campaign.stallCategory),
    name: campaign.name, coreMessage: campaign.coreMessage, rationale: stored.draft.rationale,
    recommendedPlatform: campaign.recommendedPlatform as Platform, secondaryPlatform: stored.secondaryPlatform, platformRationale: campaign.platformRationale,
    assets: { linkedin_post: stored.draft.linkedin_post, x_thread: stored.draft.x_thread, nurture_email: stored.draft.nurture_email, landing_hero: stored.draft.landing_hero, angle_tags: stored.draft.angle_tags },
    status: campaign.status, launchedAt: campaign.launchedAt?.toISOString() ?? null, createdAt: campaign.createdAt.toISOString(),
    postUrls: campaign.postUrlsJson ? JSON.parse(campaign.postUrlsJson) as Record<string, string> : {},
    provenance: campaign.provenance, model: stored.model, launchPlatforms: stored.launchPlatforms ?? [], warning: stored.warning ?? null, violations: stored.violations,
    targets,
    stats: { targets: targets.length, engagedAccounts: engaged.length, events: campaign.engagements.length, movedToRevive, pipelineInfluencedInr: engaged.reduce((sum, target) => sum + target.valueInr, 0) },
  };
}

export async function listCampaigns() {
  const campaigns = await db.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { engagements: true } } } });
  return campaigns.map((campaign) => ({
    id: campaign.id, name: campaign.name, coreMessage: campaign.coreMessage, stallCategory: campaign.stallCategory, categoryLabel: categoryLabel(campaign.stallCategory),
    status: campaign.status, recommendedPlatform: campaign.recommendedPlatform, provenance: campaign.provenance,
    targets: (JSON.parse(campaign.targetAccountIdsJson) as string[]).length, events: campaign._count.engagements,
    postUrls: campaign.postUrlsJson ? JSON.parse(campaign.postUrlsJson) as Record<string, string> : {},
    createdAt: campaign.createdAt.toISOString(), launchedAt: campaign.launchedAt?.toISOString() ?? null,
  }));
}

// ---------- Generation ----------

async function sellerFacts() {
  const seller = await db.sellerProfile.findFirst();
  if (!seller) throw new Error("Seller profile is missing. Run npm run demo:reset.");
  return {
    name: seller.name, oneLiner: seller.oneLiner, product: seller.product, icp: seller.icp,
    personas: JSON.parse(seller.personasJson) as string[],
    proofPoints: JSON.parse(seller.proofPointsJson) as string[],
    changelog: JSON.parse(seller.changelogJson) as { date: string; title: string }[],
  };
}

export async function generateCampaign(input: { stallCategory: string; regenerateFrom?: string }): Promise<CampaignView> {
  const category = StallCategory.parse(input.stallCategory);
  const { rows, people } = await openDealRows();
  const group: ObjectionGroup | undefined = aggregateObjections(rows).find((item) => item.category === category);
  if (!group) throw new Error(`No open stalled deals raised ${categoryLabel(category)}.`);
  const seller = await sellerFacts();
  const previous = input.regenerateFrom ? await db.campaign.findUnique({ where: { id: input.regenerateFrom } }) : null;
  const variant = previous ? parseAssets(previous.assetsJson).variant + 1 : 0;

  const accounts = await db.account.findMany({ where: { id: { in: group.accountIds } }, include: { contacts: true } });
  const companies = accounts.map((account) => account.name);
  const platform = recommendPlatform({
    titles: accounts.flatMap((account) => account.contacts.map((contact) => contact.title)),
    lanes: group.accounts.map((account) => account.lane),
    sizeBands: accounts.map((account) => account.sizeBand),
  });
  const forbidden = [...companies, ...people];

  let draft: CampaignDraft | null = null;
  let provenance: CampaignProvenance = "template";
  let model: string | null = null;
  let violations: string[] = [];
  const promptInput = {
    seller, categoryLabel: group.label, count: group.count, total: rows.length, valueLabel: formatINR(group.valueInr),
    quotes: group.quotes.map((quote) => ({ quote: anonymiseQuote(quote.quote, companies, people), title: quote.title, industry: quote.industry })),
    industries: [...new Set(accounts.map((account) => account.industry).filter((value): value is string => Boolean(value)))],
    roles: [...new Set(accounts.flatMap((account) => account.contacts.map((contact) => contact.title)).filter((value): value is string => Boolean(value)))],
    platform: { primary: platform.platform, secondary: platform.secondary, rationale: platform.rationale },
    variant,
  };
  try {
    let result = await callStructured({ tier: "smart", system: CAMPAIGN_SYSTEM, user: buildCampaignUserPrompt(promptInput), schema: CampaignDraft, schemaName: "CampaignDraft" });
    violations = validateCampaignAssets(result.data, forbidden);
    if (violations.length) {
      result = await callStructured({ tier: "smart", system: CAMPAIGN_SYSTEM, user: buildCampaignUserPrompt({ ...promptInput, violations }), schema: CampaignDraft, schemaName: "CampaignDraft" });
      violations = validateCampaignAssets(result.data, forbidden);
    }
    if (!violations.length) {
      draft = result.data;
      provenance = result.provenance;
      model = result.model;
    } else {
      console.warn(`[campaign] Claude draft still violated rules, using template: ${violations.join("; ")}`);
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "LlmOfflineMiss")) console.warn(`[campaign] LLM failed, using template: ${error instanceof Error ? error.message : error}`);
  }
  if (!draft) {
    const templateVariant = variant % templateVariantCount(category);
    draft = templateCampaign(category, group.quotes, seller, { count: group.count, total: rows.length, valueInr: group.valueInr }, templateVariant);
    violations = validateCampaignAssets(draft, forbidden);
    provenance = "template";
  }

  const stored: StoredAssets = { draft, secondaryPlatform: platform.secondary, variant, violations, model };
  const data = {
    stallCategory: category, name: draft.campaign_name, coreMessage: draft.core_message,
    recommendedPlatform: platform.platform, platformRationale: platform.rationale,
    assetsJson: JSON.stringify(stored), targetAccountIdsJson: JSON.stringify(group.accountIds), provenance,
  };
  const saved = previous && previous.status === "draft"
    ? await db.campaign.update({ where: { id: previous.id }, data })
    : await db.campaign.create({ data: { ...data, status: "draft" } });
  return (await getCampaignView(saved.id))!;
}

// ---------- Launch ----------

export function simulatedPostUrls(id: string, platforms: PublishPlatform[]): Record<string, string> {
  const urls: Record<string, string> = {};
  if (platforms.includes("linkedin")) urls.linkedin = `https://www.linkedin.com/feed/update/urn:li:activity:simulated-${id}`;
  if (platforms.includes("x")) urls.x = `https://x.com/cloudkavach/status/simulated-${id}`;
  return urls;
}

export function defaultLaunchPlatforms(recommended: string, secondary?: string): PublishPlatform[] {
  const picks = [recommended, secondary].filter((value): value is PublishPlatform => value === "linkedin" || value === "x");
  return picks.length ? [...new Set(picks)] : ["linkedin"];
}

export async function launchCampaign(id: string, options: { platforms?: PublishPlatform[]; forceSimulated?: boolean } = {}): Promise<{ campaign: CampaignView; laneChanges: LaneChangeResult[]; mode: "n8n" | "simulated"; warning?: string }> {
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new Error("Campaign not found.");
  const stored = parseAssets(campaign.assetsJson);
  if (LAUNCHED.includes(campaign.status)) {
    return { campaign: (await getCampaignView(id))!, laneChanges: [], mode: campaign.status === "launched" ? "n8n" : "simulated", warning: "Campaign was already launched." };
  }
  const platforms = options.platforms?.length ? [...new Set(options.platforms)] : defaultLaunchPlatforms(campaign.recommendedPlatform, stored.secondaryPlatform);
  const targetIds = JSON.parse(campaign.targetAccountIdsJson) as string[];
  let mode: "n8n" | "simulated" = "simulated";
  let warning: string | undefined;
  let postUrls: Record<string, string> = {};

  if (!options.forceSimulated && isN8nConfigured()) {
    const accounts = await db.account.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } });
    const assets: PublishAsset[] = platforms.map((platform) => platform === "linkedin"
      ? { platform, body: stored.draft.linkedin_post }
      : { platform, body: stored.draft.x_thread[0] ?? stored.draft.core_message, thread: stored.draft.x_thread.slice(1) });
    try {
      const response = await n8nLaunchCampaign({ campaignId: id, name: campaign.name, assets, targetAccounts: accounts });
      postUrls = response.postUrls ?? {};
      mode = "n8n";
    } catch (error) {
      warning = `n8n publish failed (${error instanceof Error ? error.message : "unknown error"}); launched as simulated instead.`;
    }
  }
  if (mode === "simulated") postUrls = simulatedPostUrls(id, platforms);

  await db.campaign.update({
    where: { id },
    data: {
      status: mode === "n8n" ? "launched" : "launched_simulated",
      launchedAt: now(),
      postUrlsJson: JSON.stringify(postUrls),
      assetsJson: JSON.stringify({ ...stored, launchPlatforms: platforms, warning, launchedWallClock: new Date().toISOString() }),
    },
  });
  const deals = await db.deal.findMany({ where: { accountId: { in: targetIds }, stage: { notIn: CLOSED } }, select: { id: true } });
  const laneChanges = deals.length ? await runMatcher({ dealIds: deals.map((deal) => deal.id) }) : [];
  return { campaign: (await getCampaignView(id))!, laneChanges, mode, warning };
}

/** n8n callback: a post went live on a platform. */
export async function markPostPublished(input: { campaignId: string; platform: string; postUrl: string }) {
  const campaign = await db.campaign.findUnique({ where: { id: input.campaignId } });
  if (!campaign) throw new Error("Campaign not found.");
  const urls = { ...(campaign.postUrlsJson ? JSON.parse(campaign.postUrlsJson) as Record<string, string> : {}), [input.platform]: input.postUrl };
  const stored = parseAssets(campaign.assetsJson);
  await db.campaign.update({ where: { id: campaign.id }, data: {
    postUrlsJson: JSON.stringify(urls), status: "launched", launchedAt: campaign.launchedAt ?? now(),
    assetsJson: JSON.stringify({ ...stored, launchedWallClock: stored.launchedWallClock ?? new Date().toISOString() }),
  } });
  return urls;
}

export async function latestLaunchedCampaignId(): Promise<string | null> {
  const campaign = await db.campaign.findFirst({ where: { status: { in: LAUNCHED } }, orderBy: [{ launchedAt: "desc" }, { createdAt: "desc" }] });
  return campaign?.id ?? null;
}
