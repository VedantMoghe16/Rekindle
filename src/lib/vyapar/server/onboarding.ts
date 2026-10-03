import { z } from "zod";
import { db } from "@/lib/db";
import { callStructured, LlmOfflineMiss } from "@/lib/providers/llm";
import { getSeller, remember } from "@/lib/vyapar/server/context";

/** The onboarding questions, in a shop owner's words. Answers are free text; nothing is required except what you sell. */
export const QUESTIONS = [
  { key: "sell", label: "What do you sell, and at what price?", placeholder: "Paper bags from ₹5, pastry boxes ₹9, food boxes ₹7" },
  { key: "customers", label: "Which kinds of shops buy from you most?", placeholder: "Bakeries, sweet shops, cafes, cloud kitchens" },
  { key: "area", label: "Where can you deliver?", placeholder: "Within 5 km of Chakala, Andheri East, same day" },
  { key: "goal", label: "What's your sales goal right now?", placeholder: "10 new regular buyers before Diwali" },
  { key: "hard", label: "What makes selling hard today?", placeholder: "No sales team. Buyers say price is high or they already have a supplier" },
  { key: "offer", label: "What can you offer to win a new buyer?", placeholder: "Free sample; ₹4.20 per bag for 1,000+; 15-day credit" },
  { key: "language", label: "Which language should your AI team speak?", placeholder: "Hinglish" },
] as const;
export type Answers = Partial<Record<(typeof QUESTIONS)[number]["key"], string>>;

export const Brief = z.object({
  summary: z.string().max(400).describe("2–3 plain sentences a shop owner would agree with: what they sell, to whom, and what they want"),
  idealCustomers: z.array(z.string()).max(6),
  salesNeeds: z.array(z.string()).max(5).describe("what the AI team must do for them, in plain words"),
  keyOffers: z.array(z.string()).max(5),
  huntPrompt: z.string().max(200).describe("one sentence telling the lead finder what to look for, e.g. 'Find bakeries and cloud kitchens within 5 km and pitch my ₹5 paper bags'"),
  pitchAngle: z.string().max(160),
});
export type Brief = z.infer<typeof Brief>;

const DEFAULTS: Answers = Object.fromEntries(QUESTIONS.map((q) => [q.key, q.placeholder]));

/** Deterministic brief when no LLM is available. */
export function templateBrief(a: Answers): Brief {
  const customers = (a.customers ?? DEFAULTS.customers!).split(/,|and/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
  const radius = (a.area ?? "").match(/(\d+(?:\.\d+)?)\s*km/)?.[1] ?? "5";
  const product = (a.sell ?? DEFAULTS.sell!).split(",")[0].trim();
  return {
    summary: `You sell ${a.sell ?? DEFAULTS.sell} to ${customers.join(", ").toLowerCase()}, delivering ${a.area ?? "nearby"}. Your goal: ${a.goal ?? "more regular buyers"}.`,
    idealCustomers: customers,
    salesNeeds: ["Find nearby shops that need your products", "Reach them first with a short, personal message", "Call them and handle common objections", a.hard ? `Tackle: ${a.hard}` : "Follow up until they take a sample"].slice(0, 5),
    keyOffers: (a.offer ?? DEFAULTS.offer!).split(/;|,/).map((x) => x.trim()).filter(Boolean).slice(0, 5),
    huntPrompt: `Find ${customers.slice(0, 2).join(" and ").toLowerCase()} within ${radius} km and pitch my ${product}`,
    pitchAngle: "Local supplier nearby, free sample first, bulk price for regular orders",
  };
}

export async function getOnboarding() {
  const seller = await getSeller();
  const row = await db.vyaparOnboarding.findUnique({ where: { sellerId: seller.id } });
  const answers: Answers = row ? JSON.parse(row.answersJson) : {};
  return { seller, saved: Boolean(row), answers: { ...DEFAULTS, ...answers }, brief: row ? (JSON.parse(row.brief) as Brief) : templateBrief(DEFAULTS), provider: row?.provider ?? "rules", updatedAt: row?.updatedAt ?? null };
}

/** Saves the answers, asks Gemini for a plain-language brief, and writes it to the business memory. */
export async function saveOnboarding(answers: Answers) {
  const seller = await getSeller();
  let brief = templateBrief(answers);
  let provider = "rules";
  try {
    const result = await callStructured({
      tier: "fast", schema: Brief, schemaName: "VyaparOnboardingBrief",
      system: "You brief an AI sales team that will find and contact customers for a small Indian supplier. Read the owner's answers and write a short, plain-language brief. Never invent products, prices or offers that are not in the answers.",
      user: `BUSINESS: ${seller.merchant.name}, ${seller.merchant.area}\n${QUESTIONS.map((q) => `${q.label}\n→ ${answers[q.key] ?? "(not answered)"}`).join("\n")}`,
    });
    brief = result.data;
    provider = result.provenance === "live" ? (result.provider === "anthropic" ? "claude" : result.provider) : "cached";
  } catch (error) {
    if (!(error instanceof LlmOfflineMiss)) console.warn(`[vyapar] onboarding brief via LLM failed: ${error instanceof Error ? error.message : error}`);
  }
  await db.vyaparOnboarding.upsert({ where: { sellerId: seller.id }, create: { sellerId: seller.id, answersJson: JSON.stringify(answers), brief: JSON.stringify(brief), provider }, update: { answersJson: JSON.stringify(answers), brief: JSON.stringify(brief), provider } });
  remember([{ id: `onboarding-${seller.id}-${Date.now()}`, title: "Business profile updated", text: `${seller.merchant.name} (${seller.merchant.area}). ${brief.summary} Ideal customers: ${brief.idealCustomers.join(", ")}. Offers: ${brief.keyOffers.join("; ")}. What the AI team should do: ${brief.salesNeeds.join("; ")}.` }]);
  return { brief, provider };
}
