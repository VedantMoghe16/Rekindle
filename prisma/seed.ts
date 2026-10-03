import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db";

type SeedDeal = {
  slug: string; name: string; industry: string; city: string; valueL: number;
  category: string; contact: string; title: string; channel: string; date: string;
  quote: string; summary: string; raw?: string; timing?: object; competitor?: object; missing?: object;
};

const deals: SeedDeal[] = [
  { slug: "finvara", name: "Finvara Pay", industry: "Fintech", city: "Bengaluru", valueL: 22, category: "BUDGET", contact: "Rohan Kapoor", title: "VP Engineering", channel: "whatsapp", date: "2026-03-14", quote: "But abhi budget nahi hai. We're closing our Series B, tab tak new tooling spend pe freeze hai.", summary: "Budget frozen until the Series B closes.", raw: "finvara_whatsapp.txt", timing: { text: "once the round closes", resolved_date: null, event_trigger: "FUNDING" } },
  { slug: "kredo", name: "Kredo Lending", industry: "Fintech", city: "Mumbai", valueL: 15, category: "NO_OWNER", contact: "Meera Iyer", title: "CTO", channel: "call", date: "2026-04-02", quote: "The problem is we don't have anyone owning security right now.", summary: "No dedicated owner for security.", raw: "kredo_call_transcript.txt", timing: { text: "hoping to start hiring by Q3", resolved_date: null, event_trigger: "HIRING_RELEVANT" } },
  { slug: "mediloop", name: "MediLoop Health", industry: "Healthtech", city: "Pune", valueL: 18, category: "COMPETITOR_LOCKIN", contact: "Arjun Shah", title: "Head of IT", channel: "email", date: "2026-01-20", quote: "Unfortunately we signed a one-year contract with SecureGrid in December, and it runs till 15 December 2026.", summary: "Locked into SecureGrid until December 2026.", raw: "mediloop_email.txt", competitor: { name: "SecureGrid", contract_end_date: "2026-12-15" } },
  { slug: "ledgerline", name: "Ledgerline", industry: "Fintech SaaS", city: "Chennai", valueL: 12, category: "MISSING_FEATURE", contact: "Priya Nair", title: "Compliance Head", channel: "email", date: "2026-05-05", quote: "our auditors require ISO 27001 Annex A control mapping, not just SOC 2.", summary: "Needs ISO 27001 Annex A mappings.", raw: "ledgerline_email.txt", missing: { description: "ISO 27001 Annex A control mapping", feature_key: "iso27001_mapping" } },
  { slug: "spendwise", name: "Spendwise", industry: "Expense SaaS", city: "Gurugram", valueL: 9, category: "TIMING", contact: "Aditya Bose", title: "VP Engineering", channel: "email", date: "2026-06-12", quote: "Let's pick this up after Q2 closes; October will be a better time.", summary: "Asked to revisit after Q2.", timing: { text: "after Q2 closes", resolved_date: "2026-10-01", event_trigger: "DATE_REACHED" } },
  { slug: "tripnest", name: "Tripnest", industry: "Travel tech", city: "Bengaluru", valueL: 16, category: "IMPLEMENTATION_EFFORT", contact: "Karan Malhotra", title: "Head of Engineering", channel: "whatsapp", date: "2026-05-21", quote: "Last time we tried a compliance tool, onboarding took 4 months and pulled 2 engineers off the roadmap.", summary: "Previous compliance onboarding consumed four months.", raw: "tripnest_whatsapp.txt" },
  { slug: "zestcart", name: "Zestcart", industry: "D2C platform", city: "Delhi", valueL: 11, category: "IMPLEMENTATION_EFFORT", contact: "Sana Qureshi", title: "CTO", channel: "email", date: "2026-06-03", quote: "We cannot take on another quarter-long implementation.", summary: "Team cannot absorb a long implementation." },
  { slug: "edunova", name: "Edunova", industry: "Edtech", city: "Hyderabad", valueL: 8, category: "IMPLEMENTATION_EFFORT", contact: "Rahul Verma", title: "Engineering Manager", channel: "call", date: "2026-07-10", quote: "Pichla rollout teen mahine chala, so the team is not ready for that again.", summary: "A previous three-month rollout created resistance." },
  { slug: "quickship", name: "Quickship Logistics", industry: "Logistics SaaS", city: "Ahmedabad", valueL: 10, category: "IMPLEMENTATION_EFFORT", contact: "Neeraj Patel", title: "VP Tech", channel: "email", date: "2026-04-18", quote: "We would need proof that onboarding will not pull engineers off delivery.", summary: "Concerned about engineering time during onboarding." },
  { slug: "retailo", name: "Retailo", industry: "Retail SaaS", city: "Bengaluru", valueL: 7, category: "IMPLEMENTATION_EFFORT", contact: "Divya Menon", title: "Platform Lead", channel: "whatsapp", date: "2026-07-02", quote: "Setup agar heavy hai toh abhi possible nahi hoga.", summary: "Heavy setup is a blocker for the platform team." },
  { slug: "insurenest", name: "InsureNest", industry: "Insurtech", city: "Mumbai", valueL: 10, category: "IMPLEMENTATION_EFFORT", contact: "Faisal Khan", title: "CTO", channel: "call", date: "2026-06-28", quote: "I cannot sign up for a four-month rollout with this team.", summary: "Cannot accept a long rollout." },
  { slug: "paywise", name: "Paywise", industry: "Payments", city: "Noida", valueL: 14, category: "BUDGET", contact: "Ishita Jain", title: "Finance Controller", channel: "email", date: "2026-07-09", quote: "There is no budget left in this year's security allocation.", summary: "Security budget is exhausted for the year." },
  { slug: "farmlink", name: "Farmlink Agritech", industry: "Agritech", city: "Indore", valueL: 6, category: "BUDGET", contact: "Suresh Reddy", title: "CTO", channel: "whatsapp", date: "2026-05-15", quote: "Expansion ke baad hi tooling budget revisit kar paayenge.", summary: "Budget depends on the next expansion phase." },
  { slug: "kirana", name: "Kirana Cloud", industry: "Retail tech", city: "Jaipur", valueL: 5, category: "BUDGET", contact: "Mohit Agarwal", title: "Founder", channel: "call", date: "2026-06-30", quote: "Abhi cash conserve kar rahe hain, new tools hold par hain.", summary: "Cash conservation paused new tools." },
  { slug: "mediquick", name: "MediQuick", industry: "Healthtech", city: "Kochi", valueL: 9, category: "NO_OWNER", contact: "Anjali Thomas", title: "VP Engineering", channel: "email", date: "2026-05-22", quote: "We do not have a security owner to run this evaluation.", summary: "No security owner is available." },
  { slug: "hirewell", name: "Hirewell", industry: "HR tech", city: "Bengaluru", valueL: 7, category: "NO_OWNER", contact: "Varun Sethi", title: "CTO", channel: "whatsapp", date: "2026-08-01", quote: "Security ka dedicated owner hire hone ke baad evaluate karenge.", summary: "Will evaluate after hiring a security owner." },
  { slug: "cloudbazaar", name: "CloudBazaar", industry: "B2B marketplace", city: "Mumbai", valueL: 13, category: "COMPETITOR_LOCKIN", contact: "Pooja Desai", title: "Head of Infra", channel: "email", date: "2026-07-14", quote: "Our current contract runs through June 2027, so we cannot switch now.", summary: "Competitor contract runs through June 2027.", competitor: { name: "SecureGrid", contract_end_date: "2027-06-30" } },
  { slug: "urbanmile", name: "Urbanmile", industry: "Mobility", city: "Pune", valueL: 8, category: "TIMING", contact: "Nikhil Rao", title: "VP Engineering", channel: "call", date: "2026-08-19", quote: "Let's talk in January when the platform migration is done.", summary: "Asked to reconnect in January.", timing: { text: "in January", resolved_date: "2027-01-05", event_trigger: "DATE_REACHED" } },
  { slug: "bharatfreight", name: "Bharat Freight", industry: "Logistics", city: "Delhi", valueL: 12, category: "CHAMPION_LEFT", contact: "Rakesh Gupta", title: "Former Head of IT", channel: "email", date: "2026-04-07", quote: "Rakesh, who was driving this, has moved on and we have no new owner yet.", summary: "The internal champion left the company." },
  { slug: "nimbushr", name: "Nimbus HR", industry: "HR SaaS", city: "Chandigarh", valueL: 6, category: "WENT_DARK", contact: "Tanvi Kulkarni", title: "Engineering Manager", channel: "email", date: "2026-03-25", quote: "Thanks for the proposal. We'll review internally and come back to you.", summary: "Stopped responding after receiving the proposal." },
];

const signals = [
  ["finvara", "FUNDING", "Finvara Pay raises ₹180 Cr Series B", "2026-09-24", "News", "demo"],
  ["kredo", "HIRING_RELEVANT", "Hiring 3 relevant roles", "2026-09-29", "Careers", "demo"],
  ["mediloop", "RENEWAL_WINDOW", "SecureGrid contract ends 15 Dec", "2026-10-04", "Computed", "computed"],
  ["ledgerline", "FEATURE_SHIPPED", "ISO 27001 Annex A mapping shipped", "2026-09-22", "Computed", "computed"],
  ["spendwise", "DATE_REACHED", "After Q2 has arrived", "2026-10-01", "Computed", "computed"],
  ["farmlink", "EXPANSION", "Farmlink expands to 4 new states", "2026-09-02", "News", "demo"],
  ["mediquick", "HIRING_RELEVANT", "Hiring a DevOps Engineer", "2026-07-01", "Careers", "demo"],
  ["bharatfreight", "LEADERSHIP_CHANGE", "Bharat Freight appoints new CTO", "2026-06-20", "News", "demo"],
] as const;

const outcomeHistory: [string, string, number, number, number, number][] = [
  // stallCategory, signalType, recommendations sent, replied, meetings, won (spec §12.5 target rates)
  ["BUDGET", "FUNDING", 17, 7, 4, 2],
  ["NO_OWNER", "HIRING_RELEVANT", 19, 7, 4, 1],
  ["IMPLEMENTATION_EFFORT", "CAMPAIGN_ENGAGEMENT", 12, 4, 2, 1],
  ["TIMING", "DATE_REACHED", 9, 2, 1, 0],
  ["WENT_DARK", "LEADERSHIP_CHANGE", 12, 1, 0, 0],
];

export async function seed() {
  await db.outcome.deleteMany();
  await db.engagementEvent.deleteMany();
  await db.campaign.deleteMany();
  await db.draft.deleteMany();
  await db.company.deleteMany();
  await db.researchRun.deleteMany();
  await db.icpVersion.deleteMany();
  await db.chatMessage.deleteMany();
  await db.discoveryThread.deleteMany();
  await db.leadEvidence.deleteMany();
  await db.leadCandidate.deleteMany();
  await db.recommendation.deleteMany();
  await db.laneChange.deleteMany();
  await db.signal.deleteMany();
  await db.memory.deleteMany();
  await db.interaction.deleteMany();
  await db.deal.deleteMany();
  await db.contact.deleteMany();
  await db.account.deleteMany();
  await db.sellerProfile.deleteMany();

  await db.sellerProfile.create({ data: {
    id: "seller-cloudkavach", name: "CloudKavach", repName: "Ananya Rao",
    oneLiner: "Cloud security and compliance automation for Indian SaaS and fintech teams.",
    product: "Continuous cloud security posture monitoring and automated audit readiness.",
    icp: "Indian SaaS, fintech and healthtech companies with 50–2,000 employees.",
    personasJson: JSON.stringify(["CTO", "VP Engineering", "Head of Security", "Compliance Head"]),
    proofPointsJson: JSON.stringify(["Median onboarding time is 14 days", "One-click cloud connectors", "ISO 27001 Annex A mappings"]),
    roleKeywordsJson: JSON.stringify(["security", "devsecops", "compliance", "cloud", "platform", "devops", "audit", "ciso"]),
    changelogJson: JSON.stringify([{ date: "2026-09-22", title: "ISO 27001 Annex A control mapping", featureKey: "iso27001_mapping" }]),
  }});

  const discoveryCriteria = {
    geographies: ["India"], industries: ["SaaS", "Fintech", "Healthtech"], cities: [],
    employeeMin: 50, employeeMax: 500, fundingStages: ["Series A", "Series B", "Series C"],
    personas: ["CTO", "Head of Security"], signals: ["security hiring", "compliance hiring", "enterprise expansion"],
    exclusions: ["agencies", "consultancies", "current customers"],
  };
  await db.discoveryThread.create({ data: {
    id: "discovery-main", title: "CloudKavach account discovery", currentCriteriaJson: JSON.stringify(discoveryCriteria),
    messages: { create: { role: "assistant", content: "Describe what you sell and the companies that feel the problem most. I’ll turn it into a research plan you can review." } },
    icpVersions: { create: { version: 1, prompt: "Seed CloudKavach ICP", criteriaJson: JSON.stringify(discoveryCriteria) } },
  }});

  const candidates = [
    ["orbitpay", "OrbitPay", "orbitpay.example", "Fintech", "Bengaluru", "201–500", "Series B", 96, 92, "HIGH", "CTO", ["Indian B2B fintech in the target size band", "Enterprise product pages mention audit readiness"], ["fintech", "saas", "bengaluru", "security-hiring"], "Hiring a Head of Security and two platform engineers", "Careers page lists a Head of Security opening tied to enterprise readiness", "2026-09-29"],
    ["vectorsaas", "VectorSaaS", "vectorsaas.example", "SaaS", "Mumbai", "51–200", "Series A", 94, 88, "HIGH", "VP Engineering", ["India-based enterprise SaaS", "Team size and funding stage match the ICP"], ["saas", "mumbai", "platform-hiring"], "Platform team expands after Series A", "Three new platform and cloud infrastructure roles were posted", "2026-09-24"],
    ["caremesh", "CareMesh Systems", "caremesh.example", "Healthtech", "Pune", "201–500", "Series C", 92, 86, "HIGH", "Compliance Head", ["Healthtech handling regulated workloads", "Enterprise customer segment matches CloudKavach"], ["healthtech", "pune", "compliance"], "Preparing security controls for enterprise hospital rollout", "Public trust page added SOC 2 and ISO 27001 readiness sections", "2026-09-18"],
    ["dockwise", "Dockwise Cloud", "dockwise.example", "SaaS", "Bengaluru", "51–200", "Series B", 90, 83, "HIGH", "CTO", ["Cloud-native B2B SaaS in India", "Target headcount and stage"], ["saas", "bengaluru", "devops-hiring"], "Hiring DevOps and cloud security roles", "Careers page lists DevOps Lead and Cloud Security Engineer", "2026-09-15"],
    ["ledgerbay", "LedgerBay", "ledgerbay.example", "Fintech", "Mumbai", "201–500", "Series C", 91, 76, "MEDIUM", "CISO", ["Fintech selling to mid-market businesses", "Funding and employee criteria match"], ["fintech", "mumbai", "leadership"], "Appointed a new technology risk leader", "Company news announces a VP of Technology Risk; security ownership is unclear", "2026-08-30"],
    ["clinicstack", "ClinicStack", "clinicstack.example", "Healthtech", "Kochi", "51–200", "Series A", 87, 78, "MEDIUM", "VP Engineering", ["Indian healthtech SaaS", "Early enterprise expansion is visible"], ["healthtech", "kochi", "enterprise-expansion"], "Launched an enterprise hospital product", "Product announcement targets multi-location hospital groups", "2026-09-08"],
    ["supplymint", "SupplyMint", "supplymint.example", "SaaS", "Chennai", "201–500", "Series B", 89, 70, "MEDIUM", "Head of Platform", ["B2B SaaS with cloud infrastructure", "Employee band and stage match"], ["saas", "chennai", "platform-hiring"], "Adding a platform engineering team", "Two platform roles are public, but no security role is listed", "2026-08-22"],
    ["riskpilot", "RiskPilot AI", "riskpilot.example", "Fintech", "Gurugram", "51–200", "Series A", 86, 72, "MEDIUM", "CTO", ["Regulated fintech software", "Sells risk workflows to enterprises"], ["fintech", "gurugram", "funding"], "Raised a Series A for enterprise expansion", "Funding announcement says proceeds support enterprise market expansion", "2026-08-28"],
    ["talentgrid", "TalentGrid", "talentgrid.example", "SaaS", "Hyderabad", "51–200", "Series A", 82, 61, "MEDIUM", "VP Engineering", ["Indian B2B SaaS in target size band", "Enterprise positioning appears on its product page"], ["saas", "hyderabad"], "Enterprise page recently updated", "The page mentions security reviews, but no dated compliance initiative is public", "2026-08-14"],
    ["routeflow", "RouteFlow", "routeflow.example", "SaaS", "Ahmedabad", "201–500", "Series B", 80, 54, "LOW", "CTO", ["B2B logistics SaaS", "Size and funding stage match"], ["saas", "ahmedabad"], "Cloud infrastructure role remains open", "A general cloud engineer role is relevant but weak evidence of compliance intent", "2026-07-20"],
    ["medisync", "MediSync Labs", "medisync.example", "Healthtech", "Noida", "51–200", null, 74, 57, "LOW", "Founder", ["Indian healthtech software", "Possible regulated-data need"], ["healthtech", "noida"], "Expanding engineering team", "Funding stage and enterprise focus are not confirmed", "2026-08-02"],
    ["cometops", "CometOps", "cometops.example", "SaaS", "Jaipur", "11–50", "Seed", 62, 68, "LOW", "Founder", ["Cloud operations product", "Security-related content is present"], ["saas", "jaipur", "security-hiring"], "Hiring its first security engineer", "Strong timing signal, but company size and funding stage miss the ICP", "2026-09-26"],
  ] as const;
  for (const [slug, name, domain, industry, city, sizeBand, fundingStage, fitScore, timingScore, confidence, persona, whyFit, tags, evidenceTitle, evidenceExcerpt, observedAt] of candidates) {
    await db.leadCandidate.create({ data: {
      id: `lead-${slug}`, name, domain, industry, city, sizeBand, fundingStage, fitScore, timingScore,
      overallScore: Math.round(fitScore * 0.6 + timingScore * 0.4), confidence, suggestedPersona: persona,
      whyFitJson: JSON.stringify(whyFit), tagsJson: JSON.stringify(tags),
      evidence: { create: [
        { id: `evidence-${slug}-fit`, kind: "FIT", title: `${name} company profile`, excerpt: whyFit.join("; "), sourceName: "Demo company profile", observedAt: new Date("2026-09-30T06:30:00Z"), confidence, isDemo: true },
        { id: `evidence-${slug}-signal`, kind: "SIGNAL", title: evidenceTitle, excerpt: evidenceExcerpt, sourceName: "Demo public research", observedAt: new Date(`${observedAt}T06:30:00Z`), confidence, isDemo: true },
      ] },
    }});
  }

  for (const item of deals) {
    const accountId = `account-${item.slug}`;
    const dealId = `deal-${item.slug}`;
    const interactionId = `interaction-${item.slug}`;
    let raw = `${item.contact}: ${item.quote}\nAnanya Rao: Understood. I will keep in touch.`;
    if (item.raw) raw = await readFile(join(process.cwd(), "demo", "conversations", item.raw), "utf8");
    await db.account.create({ data: {
      id: accountId, name: item.name, industry: item.industry, city: item.city, isDemo: true,
      contacts: { create: { id: `contact-${item.slug}`, name: item.contact, title: item.title, role: "champion" } },
      deals: { create: {
        id: dealId, ownerName: "Ananya Rao", valueInr: item.valueL * 100_000,
        stage: "stalled", stalledAt: new Date(`${item.date}T06:30:00Z`), lastTouchAt: new Date(`${item.date}T06:30:00Z`),
        interactions: { create: { id: interactionId, channel: item.channel, occurredAt: new Date(`${item.date}T06:30:00Z`), rawText: raw, normalizedText: raw, contentHash: createHash("sha256").update(raw).digest("hex") } },
        memory: { create: {
          id: `memory-${item.slug}`, stallCategory: item.category, summary: item.summary,
          evidenceQuote: item.quote, evidenceSpeaker: item.contact, evidenceDate: new Date(`${item.date}T06:30:00Z`), evidenceInteractionId: interactionId,
          evidenceVerified: raw.toLowerCase().includes(item.quote.toLowerCase()),
          timingJson: JSON.stringify(item.timing ?? { text: null, resolved_date: null, event_trigger: null }),
          competitorJson: JSON.stringify(item.competitor ?? { name: null, contract_end_date: null }),
          missingFeatureJson: JSON.stringify(item.missing ?? { description: null, feature_key: null }),
          stakeholdersJson: JSON.stringify([{ name: item.contact, title: item.title, role: "champion", sentiment: "positive" }]),
          commitmentsJson: "[]", sentiment: "warm", language: item.channel === "whatsapp" || item.channel === "call" ? "hinglish" : "en", confidence: 0.94,
        } },
      } },
    }});
  }

  for (const [slug, type, title, date, sourceName, provenance] of signals) {
    await db.signal.create({ data: {
      id: `signal-${slug}-${type.toLowerCase()}`, accountId: `account-${slug}`, dealId: type === "RENEWAL_WINDOW" || type === "FEATURE_SHIPPED" || type === "DATE_REACHED" ? `deal-${slug}` : null,
      type, title, detail: title, sourceName, occurredAt: new Date(`${date}T06:30:00Z`), provenance,
      dedupeKey: provenance === "computed" ? `computed:deal-${slug}:${type.toLowerCase()}` : `${sourceName.toLowerCase()}:${slug}:${type.toLowerCase()}`,
    }});
  }

  const companiesPath = join(process.cwd(), "data", "companies.json");
  if (existsSync(companiesPath)) {
    const companies = JSON.parse(await readFile(companiesPath, "utf8")) as { id: string; name: string; domain: string; industry: string; city: string; sizeBand: string; fundingStage?: string | null; careersProvider?: string; careersToken?: string | null; tags?: string[]; website?: string | null; description?: string | null }[];
    for (const company of companies) {
      await db.company.create({ data: {
        id: company.id, name: company.name, domain: company.domain, industry: company.industry, city: company.city, sizeBand: company.sizeBand,
        fundingStage: company.fundingStage ?? null, careersProvider: company.careersProvider ?? "none", careersToken: company.careersToken ?? null,
        tagsJson: JSON.stringify(company.tags ?? []), website: company.website ?? null, description: company.description ?? null, source: "curated",
      }});
    }
  }

  const allDeals = await db.deal.findMany({ include: { memory: true }, orderBy: { id: "asc" } });
  let day = 0;
  for (const [category, signalType, sent, replied, meetings, won] of outcomeHistory) {
    const pool = allDeals.filter((deal) => deal.memory?.stallCategory === category);
    const targets = pool.length ? pool : allDeals;
    for (let i = 0; i < sent; i++) {
      const deal = targets[i % targets.length];
      const occurredAt = new Date(Date.UTC(2026, 3, 1) + (day++ % 150) * 86_400_000);
      const events = ["drafted", "sent", ...(i < replied ? ["replied"] : []), ...(i < meetings ? ["meeting"] : []), ...(i < won ? ["won"] : []), ...(i >= replied ? ["no_response"] : [])];
      for (const event of events) {
        await db.outcome.create({ data: { dealId: deal.id, stallCategory: category, signalType, event, isSeeded: true, occurredAt } });
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().finally(() => db.$disconnect());
}
