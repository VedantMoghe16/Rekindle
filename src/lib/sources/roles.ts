const DEFAULT_KEYWORDS = ["security", "compliance", "platform", "infrastructure", "infra", "devops", "sre", "site reliability", "cloud", "grc", "risk", "audit", "privacy"];

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordPattern(keyword: string) {
  return new RegExp(`(^|[^a-z])${escape(keyword.toLowerCase())}($|[^a-z])`, "i");
}

/** Titles that mention any of the seller's role keywords (word-boundary match, case-insensitive). */
export function relevantRoles(titles: string[], keywords: string[] = DEFAULT_KEYWORDS): string[] {
  const patterns = (keywords.length ? keywords : DEFAULT_KEYWORDS).map((keyword) => keyword.trim()).filter(Boolean).map(keywordPattern);
  return titles.filter((title) => patterns.some((pattern) => pattern.test(title)));
}

const SENIOR = /\b(head|director|vp|vice president|chief|ciso|cto|cio|cso|svp|evp)\b/i;
const DOMAIN = /\b(security|compliance|platform|infra|infrastructure|engineering|technology|risk|grc|devops|cloud|information)\b/i;

/** A senior hire in a buying-relevant function (e.g. "Head of Security", "CISO", "Director, Platform Engineering"). */
export function isLeadershipTitle(title: string): boolean {
  if (/\b(ciso|cto|cio|cso)\b/i.test(title)) return true;
  return SENIOR.test(title) && DOMAIN.test(title);
}

export { DEFAULT_KEYWORDS as DEFAULT_ROLE_KEYWORDS };
