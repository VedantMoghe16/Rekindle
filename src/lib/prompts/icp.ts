import type { DiscoveryCriteria } from "@/lib/schemas";
import { CANONICAL_INDUSTRIES, FUNDING_STAGES } from "@/lib/engines/discovery";

export type SellerContext = { name: string; oneLiner: string; product: string; icp: string; personas: string[]; proofPoints: string[]; roleKeywords: string[] } | null;

export function icpSystemPrompt(): string {
  return [
    "You compile a B2B seller's description of their market into a structured ideal-customer-profile (ICP) research plan for Indian companies.",
    "Rules:",
    "- Use only information stated by the user or present in the seller profile. Never invent proof points, customers, metrics or capabilities.",
    "- When the user refines an existing plan, change only what they asked to change and keep every other field of the current criteria.",
    `- industries must use only these canonical values: ${CANONICAL_INDUSTRIES.join(", ")}.`,
    `- fundingStages must use only: ${FUNDING_STAGES.join(", ")}.`,
    "- employeeMin/employeeMax are integers. geographies defaults to [\"India\"]. cities stays empty unless the user restricts location.",
    "- signals are short buying-signal phrases such as \"security hiring\", \"compliance hiring\", \"platform hiring\", \"security leadership\", \"recent funding\", \"enterprise expansion\".",
    "- personas are job titles of buyers (e.g. \"CTO\", \"Head of Security\").",
    "- If something material is ambiguous or missing, add a short question to clarifications instead of guessing. Keep clarifications to at most 3.",
    "- product_profile.proof_points may only contain proof points from the seller profile or the user's message; use an empty array if there are none.",
    "- summary is one sentence describing the target accounts.",
  ].join("\n");
}

export function icpUserPrompt(prompt: string, current: DiscoveryCriteria, seller: SellerContext): string {
  return [
    "<seller_profile>",
    seller ? JSON.stringify(seller, null, 2) : "No seller profile on file.",
    "</seller_profile>",
    "<current_criteria>",
    JSON.stringify(current, null, 2),
    "</current_criteria>",
    "<user_message>",
    prompt,
    "</user_message>",
    "Return the updated criteria, summary, product_profile and clarifications.",
  ].join("\n");
}
