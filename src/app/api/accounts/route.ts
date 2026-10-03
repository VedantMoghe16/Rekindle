import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { now } from "@/lib/clock";

export async function GET() {
  const accounts = await db.account.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  return ok(accounts);
}

const Input = z.object({
  name: z.string().trim().min(2).max(80),
  domain: z.string().trim().max(120).optional().default(""),
  industry: z.string().trim().max(60).optional().default(""),
  city: z.string().trim().max(60).optional().default(""),
  careersProvider: z.enum(["none", "greenhouse", "lever"]).default("none"),
  careersToken: z.string().trim().max(80).optional().default(""),
  dealValueInr: z.number().int().nonnegative().max(1_000_000_000).default(0),
  contactName: z.string().trim().max(80).optional().default(""),
  contactTitle: z.string().trim().max(80).optional().default(""),
});

/** Adds a real account (e.g. one with a public job board) with an open deal, ready for Capture. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Add at least a company name.");
  const input = parsed.data;
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || randomUUID().slice(0, 8);
  const accountId = `account-${slug}-${randomUUID().slice(0, 4)}`;
  await db.account.create({ data: {
    id: accountId, name: input.name, domain: input.domain || null, industry: input.industry || null, city: input.city || null,
    careersProvider: input.careersToken ? input.careersProvider : "none", careersToken: input.careersToken || null, isDemo: false,
    contacts: input.contactName ? { create: { id: `contact-${randomUUID()}`, name: input.contactName, title: input.contactTitle || null } } : undefined,
    deals: { create: { id: `deal-${randomUUID()}`, ownerName: "Ananya Rao", valueInr: input.dealValueInr, stage: "stalled", stalledAt: now(), lastTouchAt: now() } },
  } });
  return ok({ accountId }, 201);
}
