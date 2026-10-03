/**
 * Runs every LLM call on the golden demo path once with live providers and stores the responses in LlmCache.
 * Afterwards set LLM_OFFLINE=true: the demo then replays cached answers with no network risk.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { isLlmAvailable } from "../src/lib/providers/llm";
import { isCogneeConfigured } from "../src/lib/providers/cognee";
import { resetDemo } from "../src/lib/services/demo";
import { compileIcp, runDiscovery } from "../src/lib/services/discovery";
import { previewCapture } from "../src/lib/services/capture";
import { generateDraft } from "../src/lib/services/drafts";
import { generateCampaign } from "../src/lib/services/campaigns";
import { ask, ingestAll } from "../src/lib/services/knowledge";
import { DEFAULT_CRITERIA } from "../src/lib/engines/discovery";

const SAMPLE_PROMPT = "We automate SOC 2 and ISO 27001 for Indian SaaS companies. Find Series A–C companies with 50–500 employees that sell to enterprises and are hiring security, platform or compliance roles. Target CTOs and Heads of Security.";
const REFINEMENTS = ["Only Bengaluru and Mumbai", "Show companies with a new security leader"];
const QUESTIONS = [
  "Which deals are blocked on implementation effort and what did they say?",
  "Which deals are blocked on budget and have had funding news?",
  "What has Kredo Lending told us and promised?",
];

async function step<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  const started = Date.now();
  try {
    const result = await fn();
    console.log(`✓ ${label} (${Date.now() - started}ms)`);
    return result;
  } catch (error) {
    console.log(`✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function main() {
  if (!isLlmAvailable()) {
    console.log("Claude is not configured. Set ANTHROPIC_API_KEY and LLM_OFFLINE=false, then rerun.");
    return;
  }
  const before = await db.llmCache.count();
  await step("Reset demo", resetDemo);

  let criteria = DEFAULT_CRITERIA;
  const plan = await step("Compile ICP", () => compileIcp(SAMPLE_PROMPT, criteria));
  if (plan) criteria = plan.criteria;
  await step("Run discovery", () => runDiscovery(SAMPLE_PROMPT, criteria));
  for (const refinement of REFINEMENTS) {
    const refined = await step(`Refine: ${refinement}`, () => compileIcp(refinement, criteria));
    if (refined) await step(`Run discovery: ${refinement}`, () => runDiscovery(refinement, refined.criteria));
  }

  const voiceNote = await readFile(join(process.cwd(), "demo", "transcripts", "kredo_voice_note.txt"), "utf8");
  await step("Extract voice note memory", () => previewCapture({ accountId: "account-kredo", channel: "call", text: voiceNote }));

  const recs = await db.recommendation.findMany({ where: { isCurrent: true, lane: "REVIVE" }, orderBy: { priorityScore: "desc" } });
  for (const rec of recs) {
    await step(`Draft ${rec.dealId} WhatsApp`, () => generateDraft(rec.id, "whatsapp", "en"));
    await step(`Draft ${rec.dealId} WhatsApp Hinglish`, () => generateDraft(rec.id, "whatsapp", "hinglish"));
    await step(`Draft ${rec.dealId} email`, () => generateDraft(rec.id, "email", "en"));
  }

  for (const category of ["IMPLEMENTATION_EFFORT", "BUDGET"]) {
    await step(`Campaign ${category}`, () => generateCampaign({ stallCategory: category }));
  }

  if (isCogneeConfigured()) {
    await step("Ingest pipeline into Cognee", ingestAll);
    console.log("Cognee cognify runs in the background. Give it a few minutes before asking questions.");
  } else {
    for (const question of QUESTIONS) await step(`Ask: ${question}`, () => ask(question));
  }

  await step("Reset demo (caches kept)", resetDemo);
  console.log(`LLM cache: ${before} → ${await db.llmCache.count()} responses. Now set LLM_OFFLINE=true for a network-free demo.`);
}

main().finally(() => db.$disconnect());
