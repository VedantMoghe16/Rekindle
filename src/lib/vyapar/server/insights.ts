import { db } from "@/lib/db";
import { cogneeSearch, isCogneeConfigured } from "@/lib/providers/cognee";
import { isN8nVyaparConfigured, n8nVyapar } from "@/lib/providers/n8n";
import { lexicalScore } from "@/lib/services/knowledge";
import { haversineKm } from "@/lib/vyapar/geo";
import { aggregateObjections, findRevivals, PLAY_OUTCOMES, templateCampaign, type CampaignAssets } from "@/lib/vyapar/growth";
import { affinity, OBJECTION_LABELS, rupees, STAGE_LABELS, type Objection, type Stage } from "@/lib/vyapar/taxonomy";
import { getSeller, liveNow, viewMerchant } from "@/lib/vyapar/server/context";

const OPEN = ["PITCHED", "REPLIED", "OBJECTION", "SAMPLE_REQUESTED", "SAMPLE_SENT", "MEETING_BOOKED"];
const DAY = 86_400_000;


export async function getHomeStats() {
  const seller = await getSeller();
  const [deals, merchants, pendingSamples] = await Promise.all([
    db.vyaparDeal.findMany({ include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    db.merchant.findMany({ where: { id: { not: seller.merchantId } } }),
    db.vyaparAction.count({ where: { type: "SAMPLE_DISPATCH", status: { in: ["scheduled", "queued"] } } }),
  ]);
  const nearby = merchants.filter((m) => !m.brand && affinity(seller.productCategory, m.category) >= 85 && haversineKm(seller.merchant, m) <= 5);
  const engaged = new Set(deals.map((d) => d.merchantId));
  return {
    sellerName: seller.merchant.name,
    ownerFirstName: seller.ownerFirstName,
    nearbyBuyers: nearby.filter((m) => !engaged.has(m.id)).length,
    nearbyPaytm: nearby.filter((m) => !engaged.has(m.id) && m.source === "demo").length,
    nearbyPublic: nearby.filter((m) => m.source === "osm").length,
    newReplies: deals.filter((d) => d.messages[0]?.direction === "in" && OPEN.includes(d.stage)).length,
    pendingSamples,
    pipelineInr: deals.filter((d) => OPEN.includes(d.stage)).reduce((s, d) => s + d.valueInr, 0),
  };
}

export async function getDealsOverview() {
  const seller = await getSeller();
  const ref = liveNow();
  const deals = await db.vyaparDeal.findMany({ include: { merchant: true, messages: { orderBy: { createdAt: "desc" } }, memories: true }, orderBy: { lastTouchAt: "desc" } });
  const count = (stages: string[]) => deals.filter((d) => stages.includes(d.stage)).length;
  const pitched = deals.length;
  const replied = deals.filter((d) => d.messages.some((m) => m.direction === "in")).length;
  const won = deals.filter((d) => d.stage === "ORDER_WON");

  const open = deals.filter((d) => d.stage === "OBJECTION").map((d) => {
    const memory = d.memories.filter((m) => m.kind === "OBJECTION" && !m.resolved).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return memory ? { dealId: d.id, merchantId: d.merchantId, merchantName: d.merchant.name, category: memory.category as Objection, quote: memory.quote, saidAt: memory.createdAt, signals: viewMerchant(d.merchant).signals, valueInr: d.valueInr } : null;
  }).filter((o): o is NonNullable<typeof o> => Boolean(o));
  const revivals = findRevivals(open, seller.offers, ref);

  const rows = deals.map((d) => {
    const lastIn = d.messages.find((m) => m.direction === "in");
    const silentDays = Math.floor((ref.getTime() - d.lastTouchAt.getTime()) / DAY);
    const cold = d.stage === "PITCHED" && !lastIn && silentDays >= 7;
    const needsYou = (d.messages[0]?.direction === "in" && OPEN.includes(d.stage)) || cold || d.stage === "SAMPLE_REQUESTED";
    return {
      id: d.id, merchantId: d.merchantId, name: d.merchant.name, category: d.merchant.category, stage: d.stage, stageLabel: STAGE_LABELS[d.stage as Stage] ?? d.stage,
      valueInr: d.valueInr, objection: d.objection ? OBJECTION_LABELS[d.objection as Objection] : null, note: cold ? `No reply for ${silentDays} days` : d.nextStep, cold, needsYou, lastTouchAt: d.lastTouchAt,
    };
  });

  return {
    kpis: {
      pipelineInr: deals.filter((d) => OPEN.includes(d.stage)).reduce((s, d) => s + d.valueInr, 0),
      wonInr: won.reduce((s, d) => s + d.valueInr, 0),
      wonCount: won.length,
      replyRate: pitched ? Math.round((replied / pitched) * 100) : 0,
      hoursSaved: Math.round(pitched * 1.2 + replied * 0.5),
    },
    funnel: [
      { label: "Pitched", value: pitched },
      { label: "Replied", value: replied },
      { label: "Objection handled", value: deals.filter((d) => d.memories.some((m) => m.kind === "OBJECTION")).length },
      { label: "Sample / meeting", value: count(["SAMPLE_REQUESTED", "SAMPLE_SENT", "MEETING_BOOKED", "ORDER_WON"]) },
      { label: "Order won", value: won.length },
    ],
    revivals,
    rows,
  };
}

export async function getMerchantMemory(merchantId: string) {
  const merchant = await db.merchant.findUnique({ where: { id: merchantId }, include: { deals: { orderBy: { createdAt: "desc" }, include: { actions: { orderBy: { createdAt: "desc" } } } }, memories: { orderBy: { createdAt: "desc" } } } });
  if (!merchant) return null;
  const seller = await getSeller();
  return { merchant: viewMerchant(merchant), distanceKm: Math.round(haversineKm(seller.merchant, merchant) * 10) / 10, deal: merchant.deals[0] ?? null, actions: merchant.deals.flatMap((d) => d.actions), memories: merchant.memories };
}

export type AskAnswer = { answer: string; sources: { merchantId: string; name: string; quote: string | null }[]; provenance: "cognee" | "local" };

const ASK_CATEGORIES: [Objection, RegExp][] = [
  ["PRICE_TOO_HIGH", /price|rate|mehnga|expensive|costly|sasta|cheap|discount/i],
  ["CREDIT_TERMS", /credit|udhaar|pay later|postpaid/i],
  ["HAS_SUPPLIER", /supplier|competitor|already/i],
  ["QUALITY_DOUBT", /quality|flimsy|kamzor/i],
];

/** "Ask about your buyers": Cognee graph search when configured, otherwise grounded local search over memories. */
export async function askMemory(question: string, merchantId?: string): Promise<AskAnswer> {
  const memories = await db.vyaparMemory.findMany({ where: merchantId ? { merchantId } : {}, include: { merchant: true, deal: true }, orderBy: { createdAt: "desc" } });
  const seller = await getSeller();
  if (isCogneeConfigured()) {
    try {
      const results = await cogneeSearch(merchantId ? `${question} (merchant: ${memories[0]?.merchant.name ?? merchantId})` : question);
      const answer = results.filter(Boolean).join("\n\n").trim();
      if (answer) return { answer, sources: memories.filter((m) => answer.includes(m.merchant.name)).slice(0, 4).map((m) => ({ merchantId: m.merchantId, name: m.merchant.name, quote: m.quote })), provenance: "cognee" };
    } catch (error) {
      console.warn(`[vyapar] Cognee search failed, using local memory: ${error instanceof Error ? error.message : error}`);
    }
  }
  const category = ASK_CATEGORIES.find(([, re]) => re.test(question))?.[0];
  const categoryFilter = /bakery|bakeries/i.test(question) ? "Bakery" : /cloud kitchen|kitchen/i.test(question) ? "Cloud kitchen" : /sweet|mithai/i.test(question) ? "Sweet shop" : /cafe/i.test(question) ? "Cafe" : null;
  if (category) {
    const hits = memories.filter((m) => m.kind === "OBJECTION" && m.category === category && (!categoryFilter || m.merchant.category === categoryFilter));
    if (!hits.length) return { answer: `No ${categoryFilter ? `${categoryFilter.toLowerCase()} ` : ""}buyer has raised "${OBJECTION_LABELS[category].toLowerCase()}" yet.`, sources: [], provenance: "local" };
    const resolved = hits.filter((m) => m.resolved || ["SAMPLE_REQUESTED", "SAMPLE_SENT", "ORDER_WON", "MEETING_BOOKED"].includes(m.deal.stage));
    const open = hits.filter((m) => !resolved.includes(m));
    const tier = seller.offers.tiers[0];
    const parts = [`${hits.length} ${categoryFilter ? `${categoryFilter.toLowerCase()}${hits.length > 1 ? "s" : ""}` : `buyer${hits.length > 1 ? "s" : ""}`} said "${OBJECTION_LABELS[category].toLowerCase()}".`];
    if (resolved.length) parts.push(`${names(resolved)} moved forward after the counter-offer.`);
    if (open.length) parts.push(`${names(open)} ${open.length > 1 ? "are" : "is"} still open${category === "PRICE_TOO_HIGH" && tier ? `. Worth reviving with the ${rupees(tier.unitPriceInr)} ${tier.label.toLowerCase()}` : ""}.`);
    return { answer: parts.join(" "), sources: hits.slice(0, 5).map((m) => ({ merchantId: m.merchantId, name: m.merchant.name, quote: m.quote })), provenance: "local" };
  }
  const ranked = memories.map((m) => ({ m, score: lexicalScore(question, `${m.merchant.name} ${m.merchant.category} ${m.summary} ${m.quote ?? ""}`) })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  if (!ranked.length) return { answer: merchantId ? "Nothing remembered about that yet for this merchant." : "Nothing in memory matches that yet. Try asking about price, credit, suppliers or a merchant's name.", sources: [], provenance: "local" };
  return { answer: ranked.map(({ m }) => `• ${m.merchant.name}: ${m.summary}`).join("\n"), sources: ranked.map(({ m }) => ({ merchantId: m.merchantId, name: m.merchant.name, quote: m.quote })), provenance: "local" };
}

function names(items: { merchant: { name: string } }[]) {
  const unique = [...new Set(items.map((i) => i.merchant.name))];
  return unique.length > 1 ? `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}` : unique[0];
}

export async function getCampaignState() {
  const seller = await getSeller();
  const [memories, merchants, wonDeals, campaigns] = await Promise.all([
    db.vyaparMemory.findMany({ where: { kind: "OBJECTION" } }),
    db.merchant.findMany({ where: { id: { not: seller.merchantId } } }),
    db.vyaparDeal.findMany({ where: { stage: "ORDER_WON" }, select: { merchantId: true } }),
    db.vyaparCampaign.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const won = new Set(wonDeals.map((d) => d.merchantId));
  // In-app offers and broadcasts only reach Paytm merchants (demo fixtures), never public-map listings.
  const audience = merchants.filter((m) => m.source === "demo" && affinity(seller.productCategory, m.category) >= 80 && haversineKm(seller.merchant, m) <= seller.offers.deliveryRadiusKm && !won.has(m.id)).length;
  const objections = aggregateObjections(memories);
  const top = objections[0]?.category ?? "PRICE_TOO_HIGH";
  const draft = templateCampaign(top, { name: seller.merchant.name, area: seller.merchant.area, handle: "@ecopack.andheri" }, seller.offers, audience);
  return {
    objections, totalReplies: memories.length, audience, top, draft,
    campaigns: campaigns.map((c) => ({ ...c, assets: JSON.parse(c.assetsJson) as CampaignAssets })),
    outcomes: PLAY_OUTCOMES.map((o) => ({ ...o, label: OBJECTION_LABELS[o.objection as Objection], sampleRate: Math.round((o.sample / o.tried) * 100) })),
  };
}

export async function launchCampaign(objection: Objection) {
  const state = await getCampaignState();
  const draft = objection === state.top ? state.draft : templateCampaign(objection, { name: (await getSeller()).merchant.name, area: (await getSeller()).merchant.area, handle: "@ecopack.andheri" }, (await getSeller()).offers, state.audience);
  let status = "launched_simulated";
  let provider = "simulated";
  if (isN8nVyaparConfigured()) {
    try {
      await n8nVyapar("campaign.launch", { objection, headline: draft.headline, assets: draft.assets, audience: state.audience });
      status = "launched";
      provider = "n8n";
    } catch (error) {
      console.warn(`[vyapar] n8n campaign launch failed, simulating: ${error instanceof Error ? error.message : error}`);
    }
  }
  return db.vyaparCampaign.create({ data: { objection, headline: draft.headline, assetsJson: JSON.stringify(draft.assets), audience: state.audience, status, provider } });
}
