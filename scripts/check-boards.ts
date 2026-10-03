import { readFile } from "node:fs/promises";
import { join } from "node:path";

type Company = { id: string; name: string; careersProvider: string; careersToken: string | null };

async function probe(provider: "greenhouse" | "lever", token: string): Promise<number | null> {
  const url = provider === "greenhouse"
    ? `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=false`
    : `https://api.lever.co/v0/postings/${token}?mode=json`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(Number(process.env.SOURCE_TIMEOUT_MS) || 8000) });
    if (!response.ok) return null;
    const body = await response.json() as { jobs?: unknown[] } | unknown[];
    return Array.isArray(body) ? body.length : body.jobs?.length ?? 0;
  } catch {
    return null;
  }
}

async function main() {
  const companies = JSON.parse(await readFile(join(process.cwd(), "data", "companies.json"), "utf8")) as Company[];
  const withBoards = companies.filter((company) => company.careersToken && company.careersProvider !== "none");
  let failures = 0;
  for (const company of withBoards) {
    const provider = company.careersProvider as "greenhouse" | "lever";
    const token = company.careersToken!;
    const count = await probe(provider, token);
    if (count !== null) { console.log(`OK    ${company.name.padEnd(24)} ${provider}:${token} · ${count} jobs`); continue; }
    failures++;
    const alternate = provider === "greenhouse" ? "lever" : "greenhouse";
    const altCount = await probe(alternate, token);
    console.log(`FAIL  ${company.name.padEnd(24)} ${provider}:${token}${altCount !== null ? ` · alternate ${alternate} works (${altCount} jobs)` : ""}`);
  }
  console.log(`\n${withBoards.length - failures}/${withBoards.length} boards reachable · ${companies.length} companies in registry`);
  if (failures) process.exitCode = 1;
}

main();
