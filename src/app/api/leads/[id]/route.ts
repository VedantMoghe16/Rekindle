import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { serializeCandidate } from "@/lib/services/discovery";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await db.leadCandidate.findUnique({ where: { id }, include: { evidence: { orderBy: { observedAt: "desc" } } } });
  if (!candidate) return fail("LEAD_NOT_FOUND", "This lead no longer exists.", 404);
  return ok(serializeCandidate(candidate));
}
