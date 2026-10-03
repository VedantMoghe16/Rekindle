import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { collectCompanyEvidence } from "@/lib/sources";
import { SignalType } from "@/lib/schemas";
import { runMatcher, upsertComputedSignals, type LaneChangeResult } from "@/lib/services/matcher";

export type IncomingSignal = { type: string; title: string; detail?: string | null; sourceUrl?: string | null; occurredAt: Date; dedupeKey: string; sourceName?: string; rawJson?: string | null };

const SOURCE_NAMES: Partial<Record<string, string>> = { HIRING_RELEVANT: "Careers", FUNDING: "News", LEADERSHIP_CHANGE: "News", EXPANSION: "News", PRODUCT_LAUNCH: "News", COMPLIANCE_EVENT: "Web" };

/** Upserts one external signal by dedupeKey. Returns true when it is new. Invalid signal types are skipped (the matcher parses them strictly). */
export async function upsertSignal(accountId: string, signal: IncomingSignal, provenance: "live" | "cached"): Promise<boolean> {
  const type = SignalType.safeParse(signal.type);
  if (!type.success || !signal.dedupeKey || Number.isNaN(signal.occurredAt.getTime())) return false;
  const existing = await db.signal.findUnique({ where: { dedupeKey: signal.dedupeKey } });
  const data = { title: signal.title.slice(0, 300), detail: signal.detail ?? signal.title, sourceUrl: signal.sourceUrl ?? null, occurredAt: signal.occurredAt, provenance, stale: provenance === "cached", rawJson: signal.rawJson ?? null };
  if (existing) {
    await db.signal.update({ where: { id: existing.id }, data });
    return false;
  }
  await db.signal.create({ data: { id: `signal-${randomUUID()}`, accountId, dealId: null, type: type.data, sourceName: signal.sourceName ?? SOURCE_NAMES[type.data] ?? "Web", dedupeKey: signal.dedupeKey, detectedAt: now(), ...data } });
  return true;
}

/** Header "Run signal check": live sources for real accounts, computed date/renewal/changelog signals for all, then the matcher. */
export async function runSignalCheck(options: { accountId?: string } = {}) {
  const steps: string[] = [];
  const seller = await db.sellerProfile.findFirst();
  const roleKeywords = seller ? JSON.parse(seller.roleKeywordsJson) as string[] : [];
  const accounts = await db.account.findMany({
    where: { ...(options.accountId ? { id: options.accountId } : {}), OR: [{ careersToken: { not: null } }, { domain: { not: null } }] },
    select: { id: true, name: true, domain: true, careersProvider: true, careersToken: true },
  });
  let signalsAdded = 0;
  for (const account of accounts) {
    try {
      const result = await collectCompanyEvidence({ name: account.name, domain: account.domain ?? "", careersProvider: account.careersProvider, careersToken: account.careersToken }, roleKeywords);
      let added = 0;
      for (const signal of result.signals) {
        const provenance = signal.provenance === "cached" || result.stale ? "cached" : "live";
        if (await upsertSignal(account.id, { ...signal, occurredAt: new Date(signal.occurredAt), rawJson: signal.roleCount ? JSON.stringify({ roleCount: signal.roleCount }) : null }, provenance)) added++;
      }
      signalsAdded += added;
      const roles = result.signals.filter((s) => s.type === "HIRING_RELEVANT").reduce((sum, s) => sum + (s.roleCount ?? 1), 0);
      const news = result.signals.filter((s) => s.type !== "HIRING_RELEVANT").length;
      const parts = [roles ? `${roles} relevant role${roles === 1 ? "" : "s"}` : null, news ? `${news} news signal${news === 1 ? "" : "s"}` : null].filter(Boolean);
      steps.push(`${account.name} · ${parts.length ? parts.join(", ") : "no new evidence"}${added ? ` · ${added} new` : ""}${result.stale ? " · cached" : ""} ${result.errors.length && !result.signals.length ? "✗" : "✓"}`);
      for (const message of result.errors.slice(0, 2)) steps.push(`  ${account.name} · ${message}`);
    } catch (error) {
      steps.push(`${account.name} · source unavailable ✗`);
      console.warn(`[signals] ${account.name}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (!accounts.length) steps.push("No accounts with a domain or careers board yet · skipped live sources");
  const computed = await upsertComputedSignals(options.accountId ? (await db.deal.findMany({ where: { accountId: options.accountId }, select: { id: true } })).map((d) => d.id) : undefined);
  signalsAdded += computed;
  steps.push(`Dates & renewals · ${computed} new ✓`);
  steps.push("Changelog ✓");
  const dealIds = options.accountId ? (await db.deal.findMany({ where: { accountId: options.accountId }, select: { id: true } })).map((d) => d.id) : undefined;
  const laneChanges = await runMatcher(dealIds ? { dealIds } : {});
  steps.push(`Matcher re-ranked the pipeline · ${laneChanges.length} lane change${laneChanges.length === 1 ? "" : "s"} ✓`);
  return { steps, signalsAdded, laneChanges };
}

/** n8n cron ingestion of a single external signal. */
export async function ingestExternalSignal(input: { accountId?: string; accountDomain?: string; type: string; title: string; detail?: string; sourceUrl?: string; occurredAt: Date; dedupeKey: string; sourceName?: string }): Promise<{ added: boolean; laneChanges: LaneChangeResult[]; accountId: string } | null> {
  const domain = input.accountDomain?.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const account = input.accountId
    ? await db.account.findUnique({ where: { id: input.accountId } })
    : domain ? await db.account.findFirst({ where: { OR: [{ domain }, { domain: `www.${domain}` }] } }) : null;
  if (!account) return null;
  const added = await upsertSignal(account.id, { ...input, sourceName: input.sourceName ?? "n8n" }, "live");
  const deals = await db.deal.findMany({ where: { accountId: account.id }, select: { id: true } });
  const laneChanges = deals.length ? await runMatcher({ dealIds: deals.map((d) => d.id) }) : [];
  return { added, laneChanges, accountId: account.id };
}
