import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unseen = new URL(request.url).searchParams.get("unseen") === "1";
  const rows = await db.laneChange.findMany({ where: unseen ? { seen: false } : undefined, orderBy: { createdAt: "desc" }, take: 20, include: { deal: { select: { accountId: true, valueInr: true, account: { select: { name: true } } } } } });
  return ok(rows.map((row) => ({ id: row.id, dealId: row.dealId, accountId: row.deal.accountId, accountName: row.deal.account.name, valueInr: row.deal.valueInr, fromLane: row.fromLane, toLane: row.toLane, reason: row.reason, createdAt: row.createdAt, seen: row.seen })));
}

const Input = z.object({ ids: z.array(z.string()).max(200) });

export async function PATCH(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "ids must be a list.");
  const result = await db.laneChange.updateMany({ where: { id: { in: parsed.data.ids } }, data: { seen: true } });
  return ok({ updated: result.count });
}
