/** Evidence verification (spec §7.1 step 4): the quote shown to a rep must exist in the source conversation. */

export type EvidenceCheck = { verified: boolean; quote: string; score: number };

const QUOTE_CHARS: Record<string, string> = { "‘": "'", "’": "'", "‚": "'", "‛": "'", "“": "\"", "”": "\"", "„": "\"", "‟": "\"", "`": "'", "´": "'", "…": "...", " ": " ", " ": " ", "‎": "", "‏": "" };

/** Normalizes text while keeping a map from each normalized char back to its source index. */
function normalizeWithMap(text: string) {
  let out = "";
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    let ch = QUOTE_CHARS[text[i]] ?? text[i];
    if (ch === "") continue;
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      ch = " ";
      lastSpace = true;
    } else lastSpace = false;
    for (const c of ch.toLowerCase()) { out += c; map.push(i); }
  }
  while (out.endsWith(" ")) { out = out.slice(0, -1); map.pop(); }
  return { out, map };
}

export function normalizeForMatch(text: string) {
  return normalizeWithMap(text).out;
}

export function tokenSet(text: string): Set<string> {
  return new Set(normalizeForMatch(text).split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2));
}

function stripQuoteMarks(quote: string) {
  return quote.trim().replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "").replace(/^(\.\.\.|…)\s*|\s*(\.\.\.|…)$/g, "").trim();
}

const LINE_PREFIX = [/^\[[^\]]{4,30}\]\s*[^:]{1,60}:\s*/, /^\d{1,2}\/\d{1,2}\/\d{2,4},[^-]{3,20}-\s*[^:]{1,60}:\s*/, /^[A-Z][\p{L} .()'-]{0,58}:\s+/u];

/** Candidate source spans: messages/lines (without timestamp or speaker prefix), sentences within them, and adjacent pairs. */
export function candidateSpans(text: string): { start: number; end: number }[] {
  const units: { start: number; end: number }[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    let start = offset;
    let body = line;
    for (const prefix of LINE_PREFIX) {
      const match = body.match(prefix);
      if (match) { start += match[0].length; body = body.slice(match[0].length); break; }
    }
    const trimmedStart = body.length - body.trimStart().length;
    start += trimmedStart;
    body = body.trim();
    if (body) {
      units.push({ start, end: start + body.length });
      const sentence = /[^.!?।]+[.!?।]*/g;
      let match: RegExpExecArray | null;
      const sentences: { start: number; end: number }[] = [];
      while ((match = sentence.exec(body))) {
        const raw = match[0];
        const lead = raw.length - raw.trimStart().length;
        const value = raw.trim();
        if (value.length > 3) sentences.push({ start: start + match.index + lead, end: start + match.index + lead + value.length });
      }
      if (sentences.length > 1) units.push(...sentences);
    }
    offset += line.length + 1;
  }
  const pairs: { start: number; end: number }[] = [];
  const lines = units.filter((unit, index) => index === 0 || unit.start >= units[index - 1].end);
  for (let i = 0; i < lines.length - 1; i++) pairs.push({ start: lines[i].start, end: lines[i + 1].end });
  return [...units, ...pairs];
}

/**
 * Exact match after whitespace/case/quote-char normalization returns the exact source substring.
 * Otherwise the best line/sentence with token overlap ≥ threshold replaces the quote; else unverified.
 */
export function verifyEvidence(quote: string, text: string, threshold = 0.6): EvidenceCheck {
  const cleaned = stripQuoteMarks(quote ?? "");
  if (!cleaned || !text) return { verified: false, quote: cleaned, score: 0 };
  const source = normalizeWithMap(text);
  const needle = normalizeForMatch(cleaned);
  const index = needle ? source.out.indexOf(needle) : -1;
  if (index >= 0) {
    const start = source.map[index];
    const end = source.map[index + needle.length - 1] + 1;
    return { verified: true, quote: text.slice(start, end), score: 1 };
  }
  const quoteTokens = tokenSet(cleaned);
  if (!quoteTokens.size) return { verified: false, quote: cleaned, score: 0 };
  let best: { start: number; end: number; score: number; precision: number } | null = null;
  for (const span of candidateSpans(text)) {
    const spanTokens = tokenSet(text.slice(span.start, span.end));
    if (!spanTokens.size) continue;
    let overlap = 0;
    for (const token of quoteTokens) if (spanTokens.has(token)) overlap++;
    const score = overlap / quoteTokens.size;
    const precision = overlap / spanTokens.size;
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && precision > best.precision)) best = { ...span, score, precision };
  }
  if (best && best.score >= threshold) return { verified: true, quote: text.slice(best.start, best.end).trim(), score: Number(best.score.toFixed(3)) };
  return { verified: false, quote: cleaned, score: best ? Number(best.score.toFixed(3)) : 0 };
}
