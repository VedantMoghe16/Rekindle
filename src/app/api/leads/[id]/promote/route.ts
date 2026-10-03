import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { evidenceSignal } from "@/lib/services/discovery";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await db.leadCandidate.findUnique({ where: { id }, include: { evidence: { orderBy: { observedAt: "desc" } } } });
  if (!candidate) return fail("LEAD_NOT_FOUND", "This lead no longer exists.", 404);
  if (candidate.promotedAccountId) return ok({ accountId: candidate.promotedAccountId, created: false });
  const existing = await db.account.findFirst({ where: { domain: candidate.domain } });
  if (existing) {
    await db.leadCandidate.update({ where: { id }, data: { promotedAccountId: existing.id, status: "SHORTLISTED" } });
    return ok({ accountId: existing.id, created: false });
  }
  const slug = candidate.id.replace(/^lead-/, "");
  const accountId = `account-discovery-${slug}`;
  const company = candidate.companyId ? await db.company.findUnique({ where: { id: candidate.companyId } }) : null;
  const signalEvidence = candidate.evidence.filter((item) => item.kind === "SIGNAL");
  const isReal = Boolean(company) && !candidate.isDemo;
  const realSignals = isReal ? signalEvidence.filter((item) => item.provenance === "live" || item.provenance === "cached").map((item) => ({ item, ...evidenceSignal(candidate.id, item) })) : [];
  const taken = realSignals.length ? new Set((await db.signal.findMany({ where: { dedupeKey: { in: realSignals.map((s) => s.dedupeKey) } }, select: { dedupeKey: true } })).map((s) => s.dedupeKey)) : new Set<string>();
  await db.$transaction(async (tx) => {
    await tx.account.create({ data: {
      id: accountId, name: candidate.name, domain: candidate.domain, industry: candidate.industry, city: candidate.city, sizeBand: candidate.sizeBand, isDemo: !isReal,
      careersProvider: company?.careersProvider ?? "none", careersToken: company?.careersToken ?? null,
      contacts: { create: { id: `contact-discovery-${slug}`, name: candidate.suggestedPersona, title: candidate.suggestedPersona, role: "unknown" } },
      deals: { create: { id: `deal-discovery-${slug}`, ownerName: "Ananya Rao", valueInr: 0, stage: "active", lane: "WATCH" } },
    }});
    if (isReal) {
      for (const [index, { item, type, dedupeKey }] of realSignals.entries()) {
        if (taken.has(dedupeKey)) continue;
        await tx.signal.create({ data: {
          id: `signal-discovery-${slug}-${index}`, accountId, type, title: item.title, detail: item.excerpt, sourceName: item.sourceName, sourceUrl: item.sourceUrl,
          occurredAt: item.observedAt, provenance: item.provenance, stale: item.provenance === "cached", dedupeKey,
        }});
      }
    } else {
      const strongestSignal = signalEvidence[0];
      if (strongestSignal) await tx.signal.create({ data: {
        id: `signal-discovery-${slug}`, accountId, type: "COMPLIANCE_EVENT", title: strongestSignal.title, detail: strongestSignal.excerpt,
        sourceName: strongestSignal.sourceName, sourceUrl: strongestSignal.sourceUrl, occurredAt: strongestSignal.observedAt,
        provenance: "demo", dedupeKey: `discovery:${candidate.id}:${strongestSignal.id}`,
      }});
    }
    await tx.leadCandidate.update({ where: { id }, data: { promotedAccountId: accountId, status: "SHORTLISTED" } });
  });
  return ok({ accountId, created: true });
}
