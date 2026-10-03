import { LanguageButton } from "@/components/paytm/translator";
import Link from "next/link";
import { Bot, Brain, ShoppingCart, BookOpen, Calculator, CalendarDays, Check, ClipboardList, CreditCard, FileText, Gauge, Handshake, Landmark, Megaphone, Menu, Music, QrCode, ReceiptText, Sparkles, Speaker, Store, ChartColumn } from "lucide-react";
import { HomeNav, SoonButton, SoonTile } from "@/components/paytm/nav";
import { Lockup, inr } from "@/components/paytm/ui";
import { getHomeStats } from "@/lib/vyapar/server/insights";
import { getFleetRun } from "@/lib/vyapar/server/fleet";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [stats, run, memories] = await Promise.all([getHomeStats(), getFleetRun(), db.knowledgeEvent.count()]);
  return <div className="page">
    <header className="appbar">
      <SoonButton label="Menu" className="icon-btn" ariaLabel="Menu"><Menu /></SoonButton>
      <Lockup size="sm" />
      <span className="grow" />
      <LanguageButton />
      <SoonButton label="Announcements" className="icon-btn" ariaLabel="Announcements"><Megaphone /></SoonButton>
    </header>
    <main className="scroll">
      <div className="quick-chips">
        <SoonButton label="Entertainment+" className="qchip"><Music />Entertainment+</SoonButton>
        <SoonButton label="Soundbox" className="qchip"><Speaker />Buy Free Soundbox!</SoonButton>
      </div>

      <div className="collect-card">
        <small>Today&apos;s collection · {stats.sellerName}</small>
        <div className="amt">₹18,420</div>
        <div className="meta"><span><Check />46 payments</span><span><Landmark />Settles 7 PM to HDFC ••21</span><span className="badge b-grey" style={{ background: "rgba(255,255,255,.15)", color: "#fff" }}>Demo</span></div>
      </div>

      <div className="team-card">
        <div className="row"><Bot size={18} /><b className="grow">Your AI sales team</b><span className="badge" style={{ background: "rgba(255,255,255,.15)", color: "#fff" }}>{run ? (run.status === "RUNNING" ? "Working…" : run.status === "DONE" ? "Last run" : "Stopped") : "Not run yet"}</span></div>
        <p>{run?.report ?? "One tap and it finds the best shops for you, pitches them on Telegram and calls them one by one."}</p>
        {run?.targets.slice(0, 3).map((t) => <div key={t.id} className="t-row"><b>#{t.priority}</b><span className="grow"><b>{t.merchant.name}</b>: {t.result ?? (t.callStatus === "CALLING" ? "on the call now…" : "queued")}</span></div>)}
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn btn-primary btn-sm grow" href={run ? "/vyapar/fleet" : "/vyapar"}>{run ? "Open AI team" : "Find shops to contact"}</Link>
          <Link className="btn btn-sm" style={{ background: "rgba(255,255,255,.15)", color: "#fff" }} href="/vyapar/memory"><Brain />Memory · {memories}</Link>
        </div>
      </div>

      <Link className="vyapar-banner" href="/vyapar">
        <span className="bolt"><Sparkles /></span>
        <span><b>Vyapar AI: find buyers near you</b><span className="copy">{stats.nearbyBuyers} likely buyers within 5 km: {stats.nearbyPaytm} on Paytm, {stats.nearbyPublic} on the public map</span></span>
        <span className="cta">Try now</span>
      </Link>

      <section className="section">
        <div className="section-h"><h2>Grow Your Business</h2></div>
        <div className="grid-tiles">
          <Link className="tile ai" href="/vyapar"><span className="ribbon">AI · New</span><span className="ic"><Sparkles /></span>Vyapar AI</Link>
          <Link className="tile" href="/buy"><span className="ribbon">New</span><span className="ic"><ShoppingCart /></span>Buy Supplies</Link>
          <SoonTile label="Photo QR"><span className="ribbon">New</span><span className="ic"><QrCode /></span>Photo QR</SoonTile>
          <SoonTile label="Soundbox"><span className="ribbon">100% Cashback</span><span className="ic"><Speaker /></span>Get Soundbox</SoonTile>
          <SoonTile label="Card Machine"><span className="ribbon">Upto 100% Cashback</span><span className="ic"><CreditCard /></span>Card Machine</SoonTile>
          <SoonTile label="Credit Score"><span className="ic"><Gauge /></span>FREE Credit Score</SoonTile>
          <Link className="tile" href="/vyapar/deals"><span className="ic"><Handshake />{stats.newReplies > 0 && <span className="dot">{stats.newReplies}</span>}</span>My Deals</Link>
          <SoonTile label="QR Store"><span className="ic"><Store /></span>QR Store</SoonTile>
          <SoonTile label="Khata"><span className="ic"><BookOpen /></span>Khata Entry</SoonTile>
          <SoonTile label="Analytics"><span className="ic"><ChartColumn /></span>Analytics</SoonTile>
          <Link className="tile" href="/vyapar/campaigns"><span className="ic"><Megaphone /></span>Campaigns</Link>
          <SoonTile label="Attendance"><span className="ic"><CalendarDays /></span>Attendance</SoonTile>
          <SoonTile label="GST Invoices"><span className="ic"><FileText /></span>GST Invoices</SoonTile>
          <SoonTile label="Reports"><span className="ic"><ClipboardList /></span>Reports</SoonTile>
          <Link className="tile" href="/vyapar/fleet"><span className="ribbon">AI</span><span className="ic"><Bot /></span>AI Sales Team</Link>
        </div>
      </section>

      <section className="section" style={{ marginBottom: 12 }}>
        <div className="section-h"><h2>Vyapar AI today</h2><Link className="link" href="/vyapar/deals">View deals</Link></div>
        <div className="stats-mini">
          <Link href="/vyapar/deals"><b>{stats.newReplies}</b><small>New replies</small></Link>
          <Link href="/vyapar/deals"><b>{stats.pendingSamples}</b><small>Samples to send</small></Link>
          <Link href="/vyapar/deals"><b>{inr(stats.pipelineInr)}</b><small>In pipeline</small></Link>
        </div>
      </section>
    </main>
    <HomeNav />
  </div>;
}
