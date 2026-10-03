import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await db.leadCandidate.findUnique({ where: { id }, include: { evidence: { orderBy: { observedAt: "desc" } } } });
  if (!candidate) return NextResponse.json({ ok: false, error: { code: "LEAD_NOT_FOUND", message: "This lead no longer exists." } }, { status: 404 });
  if (candidate.promotedAccountId) return NextResponse.json({ ok: true, data: { accountId: candidate.promotedAccountId, created: false } });
  const existing = await db.account.findFirst({ where: { domain: candidate.domain } });
  if (existing) {
    await db.leadCandidate.update({ where: { id }, data: { promotedAccountId: existing.id, status: "SHORTLISTED" } });
    return NextResponse.json({ ok: true, data: { accountId: existing.id, created: false } });
  }
  const slug = candidate.id.replace(/^lead-/, "");
  const accountId = `account-discovery-${slug}`;
  const strongestSignal = candidate.evidence.find((item) => item.kind === "SIGNAL");
  await db.$transaction(async (tx) => {
    await tx.account.create({ data: {
      id: accountId, name: candidate.name, domain: candidate.domain, industry: candidate.industry, city: candidate.city, sizeBand: candidate.sizeBand, isDemo: true,
      contacts: { create: { id: `contact-discovery-${slug}`, name: candidate.suggestedPersona, title: candidate.suggestedPersona, role: "unknown" } },
      deals: { create: { id: `deal-discovery-${slug}`, ownerName: "Ananya Rao", valueInr: 0, stage: "active", lane: "WATCH" } },
    }});
    if (strongestSignal) await tx.signal.create({ data: {
      id: `signal-discovery-${slug}`, accountId, type: "COMPLIANCE_EVENT", title: strongestSignal.title, detail: strongestSignal.excerpt,
      sourceName: strongestSignal.sourceName, sourceUrl: strongestSignal.sourceUrl, occurredAt: strongestSignal.observedAt,
      provenance: "demo", dedupeKey: `discovery:${candidate.id}:${strongestSignal.id}`,
    }});
    await tx.leadCandidate.update({ where: { id }, data: { promotedAccountId: accountId, status: "SHORTLISTED" } });
  });
  return NextResponse.json({ ok: true, data: { accountId, created: true } });
}
