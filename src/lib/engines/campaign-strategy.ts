import fallbacks from "../../../data/campaign-fallbacks.json";
import type { CampaignDraft } from "@/lib/schemas";
import { categoryLabel } from "@/lib/engines/insights";
import { formatINR } from "@/lib/format";

export type Platform = "linkedin" | "x" | "email";
export type PlatformRecommendation = { platform: Platform; rationale: string; secondary: Platform };

export const LIMITS = { linkedinPost: 1200, xPost: 280, xPosts: 5, emailWords: 150, heroWords: 10 } as const;

const BUILDER = /founder|developer|engineer|platform|devops/i;
const SENIOR_EXEC = /\b(cto|ceo|cio|ciso|chief|vp|vice president|head|director)\b/i;
const COMPLIANCE = /security|compliance|ciso|risk|audit|grc|infosec|legal|finance|controller/i;

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Picks the channel the target buyers actually live on.
 * - Email nurture when ≥50% of target deals are already WARM (they know us; a 1:1 nudge beats a broadcast).
 * - X when ≥50% of titles are builders (founder/developer/engineer/platform/devops, excluding senior execs other than founders) and the audience is not compliance-heavy.
 * - LinkedIn otherwise (B2B execs, security and compliance buyers).
 */
export function recommendPlatform(input: { titles: (string | null | undefined)[]; lanes: string[]; sizeBands?: (string | null | undefined)[] }): PlatformRecommendation {
  const titles = input.titles.filter((title): title is string => Boolean(title && title.trim()));
  const total = titles.length;
  const builders = titles.filter((title) => BUILDER.test(title) && (/founder/i.test(title) || !SENIOR_EXEC.test(title))).length;
  const execs = titles.filter((title) => SENIOR_EXEC.test(title)).length;
  const compliance = titles.filter((title) => COMPLIANCE.test(title)).length;
  const warm = input.lanes.filter((lane) => lane === "WARM").length;
  const deals = input.lanes.length;
  const complianceHeavy = total > 0 && compliance / total >= 1 / 3;
  const small = (input.sizeBands ?? []).filter((band) => band && /^(1|11)[–-]/.test(band)).length;

  if (deals > 0 && warm / deals >= 0.5) {
    return {
      platform: "email",
      secondary: builders / Math.max(total, 1) >= 0.5 && !complianceHeavy ? "x" : "linkedin",
      rationale: `${warm} of ${plural(deals, "target deal")} are already WARM: these buyers know us, so a 1:1 nurture email from the rep converts better than a public post. Keep a public post running as air cover.`,
    };
  }
  if (total > 0 && builders / total >= 0.5 && !complianceHeavy) {
    return {
      platform: "x",
      secondary: "linkedin",
      rationale: `${builders} of ${plural(total, "target contact")} are hands-on builders (founders, engineers, platform/DevOps)${small ? `, and ${small} are small teams` : ""}. They read X threads more than LinkedIn feeds, and none of the audience is compliance-led, so a technical thread fits. LinkedIn covers the remaining ${total - builders}.`,
    };
  }
  const reasons = [`${execs} of ${plural(total, "target contact")} are senior B2B leaders (CTO, VP, Head of)`];
  if (compliance) reasons.push(`${compliance} hold security, compliance or finance titles`);
  return {
    platform: "linkedin",
    secondary: builders > 0 && !complianceHeavy ? "x" : "email",
    rationale: total === 0
      ? "No contact titles on file, so LinkedIn is the safest default for a B2B security audience."
      : `${reasons.join(" and ")}. They evaluate vendors on LinkedIn, and only ${builders} of ${total} are hands-on builders who would see an X thread, so LinkedIn leads${builders ? " and an X thread is the secondary channel" : ""}.`,
  };
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Spec §7.7 guardrails. Returns human-readable violations; an empty array means the draft is publishable. */
export function validateCampaignAssets(draft: CampaignDraft, forbiddenNames: string[] = []): string[] {
  const violations: string[] = [];
  if (!draft.core_message.trim()) violations.push("Core message is empty.");
  if (draft.linkedin_post.length > LIMITS.linkedinPost) violations.push(`LinkedIn post is ${draft.linkedin_post.length} characters; the limit is ${LIMITS.linkedinPost}.`);
  if (draft.x_thread.length === 0) violations.push("X thread has no posts.");
  if (draft.x_thread.length > LIMITS.xPosts) violations.push(`X thread has ${draft.x_thread.length} posts; the limit is ${LIMITS.xPosts}.`);
  draft.x_thread.forEach((post, index) => {
    if (post.length > LIMITS.xPost) violations.push(`X post ${index + 1} is ${post.length} characters; the limit is ${LIMITS.xPost}.`);
  });
  const emailWords = wordCount(draft.nurture_email.body);
  if (emailWords > LIMITS.emailWords) violations.push(`Nurture email is ${emailWords} words; the limit is ${LIMITS.emailWords}.`);
  const heroWords = wordCount(draft.landing_hero.headline);
  if (heroWords > LIMITS.heroWords) violations.push(`Landing hero headline is ${heroWords} words; the limit is ${LIMITS.heroWords}.`);
  const publicText = [draft.campaign_name, draft.core_message, draft.linkedin_post, ...draft.x_thread, draft.nurture_email.subject, draft.nurture_email.body, draft.landing_hero.headline, draft.landing_hero.subhead, draft.landing_hero.cta].join("\n").toLowerCase();
  for (const name of forbiddenNames) {
    if (name.trim().length >= 3 && publicText.includes(name.toLowerCase())) violations.push(`Public assets name a target account or person: "${name}".`);
  }
  return violations;
}

export type TemplateSeller = { name: string; proofPoints: string[]; changelog: { date: string; title: string }[] };
export type TemplateContext = { count: number; total: number; valueInr: number };
type FallbackFile = { categories: Record<string, CampaignDraft[]>; generic: CampaignDraft };

export function templateVariantCount(category: string): number {
  return (fallbacks as unknown as FallbackFile).categories[category]?.length ?? 1;
}

/** Deterministic campaign used when Claude is unavailable. Content is pre-written against the seller's proof points only. */
export function templateCampaign(category: string, quotes: { quote: string }[], seller: TemplateSeller, context: TemplateContext = { count: quotes.length, total: quotes.length, valueInr: 0 }, variant = 0): CampaignDraft {
  const file = fallbacks as unknown as FallbackFile;
  const options = file.categories[category];
  const base = options?.length ? options[variant % options.length] : file.generic;
  const topQuote = [...quotes].map((item) => item.quote.trim()).filter(Boolean).sort((a, b) => a.length - b.length).find((quote) => quote.length <= 140) ?? quotes[0]?.quote ?? "";
  const tokens: Record<string, string> = {
    seller: seller.name,
    label: categoryLabel(category).toLowerCase(),
    count: String(context.count),
    total: String(context.total),
    share: `${Math.round((context.total ? context.count / context.total : 0) * 100)}%`,
    value: formatINR(context.valueInr),
    topQuote: topQuote.replace(/[.\s]+$/, "") + ".",
  };
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (match, key: string) => tokens[key] ?? match);
  const filledName = fill(base.campaign_name);
  return {
    campaign_name: filledName.charAt(0).toUpperCase() + filledName.slice(1),
    core_message: fill(base.core_message),
    rationale: fill(base.rationale),
    linkedin_post: fill(base.linkedin_post),
    x_thread: base.x_thread.map(fill),
    nurture_email: { subject: fill(base.nurture_email.subject), body: fill(base.nurture_email.body) },
    landing_hero: { headline: fill(base.landing_hero.headline), subhead: fill(base.landing_hero.subhead), cta: fill(base.landing_hero.cta) },
    angle_tags: [...base.angle_tags],
  };
}
