import { describe, expect, it } from "vitest";
import { classifyHeadline, filterCompanyNews, parseRssItems, titleMentions } from "@/lib/sources/news";
import { isLeadershipTitle, relevantRoles } from "@/lib/sources/roles";
import { normalizeGreenhouse } from "@/lib/sources/greenhouse";
import { normalizeLever } from "@/lib/sources/lever";
import { boardEvidence } from "@/lib/sources";

const RSS = `<?xml version="1.0"?><rss><channel><title>Google News</title>
<item><title>Acme Cloud raises $40 million in Series B led by Peak XV - The Economic Times</title><link>https://news.google.com/rss/articles/abc?oc=5</link><pubDate>Mon, 21 Sep 2026 07:00:00 GMT</pubDate><source url="https://economictimes.indiatimes.com">The Economic Times</source></item>
<item><title><![CDATA[Acme Cloud appoints Priya Nair as Chief Information Security Officer &amp; VP - YourStory]]></title><link>https://news.google.com/rss/articles/def</link><pubDate>Tue, 01 Sep 2026 10:00:00 GMT</pubDate><source url="https://yourstory.com">YourStory</source></item>
<item><title>Another company expands to Dubai - Mint</title><link>https://news.google.com/rss/articles/ghi</link><pubDate>Tue, 01 Sep 2026 10:00:00 GMT</pubDate><source url="https://livemint.com">Mint</source></item>
<item><title>Acme Cloud launches AI agent - Inc42</title><link>https://news.google.com/rss/articles/old</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate><source url="https://inc42.com">Inc42</source></item>
</channel></rss>`;

describe("classifyHeadline", () => {
  it("detects funding, leadership, expansion and launches", () => {
    expect(classifyHeadline("Acme raises $40 million in Series B")).toBe("FUNDING");
    expect(classifyHeadline("Acme appoints former Google exec as CTO")).toBe("LEADERSHIP_CHANGE");
    expect(classifyHeadline("Acme expands to the Middle East")).toBe("EXPANSION");
    expect(classifyHeadline("Acme launches AI copilot for finance teams")).toBe("PRODUCT_LAUNCH");
    expect(classifyHeadline("Acme's quarterly results beat estimates")).toBeNull();
  });
  it("ignores aggregator profile pages and non-technical appointments", () => {
    expect(classifyHeadline("Zluri - 2026 Funding Rounds & List of Investors", "Tracxn")).toBeNull();
    expect(classifyHeadline("HealthPlix Revenue 2024: $8.1M Est. ARR, $22.6M Raised", "GetLatka")).toBeNull();
    expect(classifyHeadline("Signzy appoints Shashank Jaiswal as Head of Field Marketing")).toBeNull();
    expect(classifyHeadline("CloudSEK Appoints Regional Sales Director to Drive DACH Expansion")).toBe("EXPANSION");
    expect(classifyHeadline("Acme names new Chief Information Security Officer")).toBe("LEADERSHIP_CHANGE");
  });
  it("prefers funding when a headline mentions several things", () => {
    expect(classifyHeadline("Acme raises Series C to expand into the US")).toBe("FUNDING");
  });
});

describe("roles", () => {
  const titles = ["Senior Security Engineer", "Head of Platform Engineering", "Account Executive", "Compliance Manager", "Insecure Title Test", "SRE II"];
  it("matches keywords on word boundaries", () => {
    expect(relevantRoles(titles, ["security", "compliance", "sre"])).toEqual(["Senior Security Engineer", "Compliance Manager", "SRE II"]);
  });
  it("falls back to default keywords", () => {
    expect(relevantRoles(titles, [])).toContain("Head of Platform Engineering");
  });
  it("identifies leadership titles in relevant functions", () => {
    expect(isLeadershipTitle("Head of Security")).toBe(true);
    expect(isLeadershipTitle("CISO")).toBe(true);
    expect(isLeadershipTitle("Director, Platform Engineering")).toBe(true);
    expect(isLeadershipTitle("VP Sales")).toBe(false);
    expect(isLeadershipTitle("Security Engineer")).toBe(false);
  });
});

describe("RSS parsing", () => {
  const items = parseRssItems(RSS);
  it("extracts items, decodes CDATA/entities and strips the publisher suffix", () => {
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ title: "Acme Cloud raises $40 million in Series B led by Peak XV", link: "https://news.google.com/rss/articles/abc?oc=5", source: "The Economic Times" });
    expect(items[1].title).toBe("Acme Cloud appoints Priya Nair as Chief Information Security Officer & VP");
    expect(items[0].pubDate?.toISOString()).toBe("2026-09-21T07:00:00.000Z");
  });
  it("requires the company name in the title and drops items older than 120 days", () => {
    const kept = filterCompanyNews(items, "Acme Cloud", new Date("2026-10-04T00:00:00Z"));
    expect(kept.map((item) => item.link)).toEqual(["https://news.google.com/rss/articles/abc?oc=5", "https://news.google.com/rss/articles/def"]);
  });
});

describe("titleMentions", () => {
  it("matches on word boundaries and is case-sensitive for short names", () => {
    expect(titleMentions("SETU launches four-year plan", "Setu")).toBe(false);
    expect(titleMentions("Setu adds UPI APIs", "Setu")).toBe(true);
    expect(titleMentions("Browserstack expands in Europe", "BrowserStack")).toBe(true);
    expect(titleMentions("Credible news", "CRED")).toBe(false);
  });
});

describe("board normalization and evidence", () => {
  it("normalizes Greenhouse and Lever payloads", () => {
    expect(normalizeGreenhouse("acme", { jobs: [{ id: 7, title: " Security Engineer ", location: { name: "Bengaluru" }, absolute_url: "https://x/7", updated_at: "2026-09-30T00:00:00Z" }] })[0]).toMatchObject({ id: "7", title: "Security Engineer", location: "Bengaluru", url: "https://x/7" });
    expect(normalizeLever("acme", [{ id: "a1", text: "Head of Security", hostedUrl: "https://jobs.lever.co/acme/a1", createdAt: 1790000000000, categories: { location: "Pune" } }])[0]).toMatchObject({ id: "a1", title: "Head of Security", location: "Pune" });
    expect(normalizeLever("acme", { error: true })).toEqual([]);
  });
  it("aggregates relevant roles into one hiring signal plus a leadership signal", () => {
    const board = { jobs: [
      { id: "2", title: "Head of Security", location: null, url: "https://j/2", updatedAt: new Date("2026-09-20") },
      { id: "1", title: "Platform Engineer", location: null, url: "https://j/1", updatedAt: new Date("2026-09-25") },
      { id: "3", title: "Account Executive", location: null, url: "https://j/3", updatedAt: null },
    ], stale: false, fetchedAt: new Date("2026-10-01"), boardUrl: "https://job-boards.greenhouse.io/acme" };
    const result = boardEvidence({ name: "Acme", domain: "acme.in", careersProvider: "greenhouse", careersToken: "acme" }, "greenhouse", "acme", board, ["security", "platform"]);
    expect(result.signals.map((signal) => signal.type)).toEqual(["HIRING_RELEVANT", "LEADERSHIP_CHANGE"]);
    expect(result.signals[0]).toMatchObject({ roleCount: 2, provenance: "live" });
    expect(result.signals[0].dedupeKey).toMatch(/^greenhouse:acme:[0-9a-f]{12}$/);
    expect(result.evidence[0].observedAt.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(result.evidence.every((item) => item.dedupeKey)).toBe(true);
  });
});
