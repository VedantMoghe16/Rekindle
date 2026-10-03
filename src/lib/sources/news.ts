import { fetchTextWithCache } from "./cache";

export type NewsSignalType = "FUNDING" | "LEADERSHIP_CHANGE" | "EXPANSION" | "PRODUCT_LAUNCH";
export type NewsItem = { title: string; link: string; pubDate: Date | null; source: string | null };

const RULES: [NewsSignalType, RegExp][] = [
  ["FUNDING", /\b(raises?|raised|funding|series [a-h]|seed round|pre-series|investment from|led by|valuation|unicorn|ipo|fundraise)\b/i],
  ["LEADERSHIP_CHANGE", /\b(appoints?|appointed|names|named|hires?|joins as|elevates?|promotes?|new (ceo|cto|cfo|ciso|coo|chief)|as (its )?(chief|ceo|cto|cfo|ciso|head|president|vp))\b/i],
  ["EXPANSION", /\b(expands?|expansion|enters?|opens?|launch(es)? (in|operations)|new office|foray|acquires?|acquisition|international|global markets?)\b/i],
  ["PRODUCT_LAUNCH", /\b(launch(es|ed)?|unveils?|introduces?|rolls out|debuts?|releases?|partners? with|partnership)\b/i],
];

const PROFILE_SOURCES = /^(tracxn|getlatka|crunchbase|pitchbook|cb insights|owler|zaubacorp|craft\.co|zoominfo|growjo|leadiq|rocketreach|clay|private company|startuptalky)$/i;
const PROFILE_TITLE = /(list of investors|funding rounds?\s*&|shareholding|valuation\s*&|revenue \d{4}|est\. arr|company profile|competitors and alternatives|org chart|employee count|- \d{4} (latest|funding|company))/i;

/** Data-aggregator profile pages ("Acme - 2026 Funding Rounds & List of Investors") are not news events. */
export function isProfilePage(title: string, source?: string | null): boolean {
  return PROFILE_TITLE.test(title) || Boolean(source && PROFILE_SOURCES.test(source.trim()));
}

const RELEVANT_LEADER = /\b(cto|ciso|cio|ceo|coo|cfo|cpo|chief|security|technology|engineering|compliance|risk|platform|infrastructure|co-?founder)\b/i;

/**
 * Keyword-rule headline classifier. Order matters: funding > leadership > expansion > product launch.
 * Leadership appointments only count when the role is C-suite or technical/security/risk; other appointments
 * fall through to the remaining rules. Aggregator profile pages return null.
 */
export function classifyHeadline(title: string, source?: string | null): NewsSignalType | null {
  if (isProfilePage(title, source)) return null;
  for (const [type, pattern] of RULES) {
    if (!pattern.test(title)) continue;
    if (type === "LEADERSHIP_CHANGE" && !RELEVANT_LEADER.test(title)) continue;
    return type;
  }
  return null;
}

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decode(match[1]) : null;
}

/** Regex-parse RSS `<item>` blocks into title/link/pubDate/source. Pure; exported for tests. */
export function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = tag(block, "title");
    const link = tag(block, "link");
    if (!title || !link) continue;
    const source = tag(block, "source");
    const date = tag(block, "pubDate");
    const parsed = date ? new Date(date) : null;
    // Google News appends " - Publisher" to titles; strip it when it matches the source.
    const cleanTitle = source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)).trim() : title;
    items.push({ title: cleanTitle, link, pubDate: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null, source });
  }
  return items;
}

/**
 * Company names that collide with common words or other organisations (Setu vs SETU, Zeta vs Zeta Global,
 * Open, Plum, Porter…). News for these domains is skipped rather than risk attributing someone else's headline.
 */
export const AMBIGUOUS_NEWS_DOMAINS = new Set(["setu.co", "open.money", "plumhq.com", "porter.in", "zeta.tech", "fi.money", "eka.care", "apna.co", "locus.sh", "udaan.com"]);

/** Word-boundary name match; names of 5 characters or fewer must match case-sensitively (e.g. "CRED", not "cred"). */
export function titleMentions(title: string, companyName: string): boolean {
  const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`, companyName.length <= 5 ? "" : "i");
  return pattern.test(title);
}

/** Keep items that mention the company in the title and are no older than maxAgeDays (relative to `reference`). */
export function filterCompanyNews(items: NewsItem[], companyName: string, reference: Date, maxAgeDays = 120): NewsItem[] {
  const cutoff = reference.getTime() - maxAgeDays * 86_400_000;
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!titleMentions(item.title, companyName)) return false;
    if (item.pubDate && item.pubDate.getTime() < cutoff) return false;
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function googleNewsUrl(companyName: string) {
  const query = `"${companyName}" (funding OR raises OR appoints OR expands OR launches)`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query).replace(/%20/g, "+")}&hl=en-IN&gl=IN&ceid=IN:en`;
}

/** Recent Google News headlines naming the company, classified into signal types (unclassified items get type null). */
export async function fetchCompanyNews(companyName: string, options: { reference?: Date; maxAgeDays?: number; ttlMs?: number } = {}) {
  const result = await fetchTextWithCache(`news:${companyName.toLowerCase()}`, googleNewsUrl(companyName), options.ttlMs);
  const items = filterCompanyNews(parseRssItems(result.data), companyName, options.reference ?? new Date(), options.maxAgeDays ?? 120);
  return { items: items.map((item) => ({ ...item, type: classifyHeadline(item.title, item.source) })), stale: result.stale, fetchedAt: result.fetchedAt };
}
