import { LIMITS, type Platform } from "@/lib/engines/campaign-strategy";

/** Spec §8.5 campaign prompt, extended with the chosen channel and an X thread. */
export const CAMPAIGN_SYSTEM = `You are a B2B demand-generation strategist. You turn REAL buyer objections from stalled
sales conversations into a focused campaign that answers that objection.

Rules:
- The campaign must directly answer the objection, using the buyers' own language where useful.
- Use ONLY the seller proof points and changelog provided. If a claim needs proof you don't have,
  use a bracketed placeholder like [customer name] or [metric]. Never invent customers, logos or numbers.
- Never name the target accounts or any individual in public assets. Do not quote a buyer verbatim in public assets;
  paraphrase the shared concern instead (the quotes are for your understanding only).
- Tone: confident, specific, no buzzwords ("revolutionize", "synergy", "game-changer" are banned).
- Respect length limits exactly:
  - linkedin_post: founder voice, at most ${LIMITS.linkedinPost} characters including line breaks.
  - x_thread: 3 to ${LIMITS.xPosts} posts, each at most ${LIMITS.xPost} characters, no hashtags spam (max one per post), the first post must stand alone.
  - nurture_email: a 1:1 note from the rep to a buyer who raised this objection, body at most ${LIMITS.emailWords} words, use [first name] and [your name].
  - landing_hero.headline: at most ${LIMITS.heroWords} words; subhead one sentence; cta 2 to 5 words.
- core_message: one short line (under 10 words) that every asset repeats.
- angle_tags: 1 to 3 of Proof, Pain, Speed, Timing, New.
- rationale: explain in 2–3 sentences why this message, citing how many stalled deals raised the objection
  and which proof points you used. Also say why the recommended channel suits this audience.`;

export type CampaignPromptInput = {
  seller: { name: string; oneLiner: string; product: string; icp: string; personas: string[]; proofPoints: string[]; changelog: { date: string; title: string }[] };
  categoryLabel: string;
  count: number;
  total: number;
  valueLabel: string;
  quotes: { quote: string; title: string | null; industry: string | null }[];
  industries: string[];
  roles: string[];
  platform: { primary: Platform; secondary: Platform; rationale: string };
  violations?: string[];
  variant?: number;
};

const CHANNEL_NAMES: Record<Platform, string> = { linkedin: "LinkedIn", x: "X (Twitter)", email: "Email nurture" };

export function buildCampaignUserPrompt(input: CampaignPromptInput): string {
  const lines = [
    `SELLER: ${input.seller.name}: ${input.seller.oneLiner}`,
    `PRODUCT: ${input.seller.product}`,
    `ICP / PERSONAS: ${input.seller.icp}; ${input.seller.personas.join(", ")}`,
    `PROOF POINTS (only facts you may use):`,
    ...input.seller.proofPoints.map((point) => `- ${point}`),
    `CHANGELOG:`,
    ...(input.seller.changelog.length ? input.seller.changelog.map((entry) => `- ${entry.date}: ${entry.title}`) : ["- (none)"]),
    `OBJECTION: ${input.categoryLabel}: raised in ${input.count} of ${input.total} stalled deals (${input.valueLabel} pipeline, ${Math.round((input.count / Math.max(input.total, 1)) * 100)}% of stalled deals)`,
    `BUYER QUOTES (anonymized, verbatim):`,
    ...input.quotes.map((quote) => `- "${quote.quote}" (${quote.title ?? "buyer"}, ${quote.industry ?? "B2B"})`),
    `TARGET AUDIENCE: ${input.count} stalled accounts in ${input.industries.join(", ") || "B2B software"}; roles: ${input.roles.join(", ") || "engineering leaders"}`,
    `RECOMMENDED CHANNEL: ${CHANNEL_NAMES[input.platform.primary]} (secondary: ${CHANNEL_NAMES[input.platform.secondary]}). Why: ${input.platform.rationale}`,
    `Write every asset (LinkedIn post, X thread, nurture email, landing hero) so the campaign can run on any channel, but tune the voice for the recommended channel.`,
  ];
  if (input.variant) lines.push(`VARIATION ${input.variant}: take a different angle from the obvious one while answering the same objection.`);
  if (input.violations?.length) lines.push(`Your previous draft broke these rules; fix every one:`, ...input.violations.map((violation) => `- ${violation}`));
  return lines.join("\n");
}
