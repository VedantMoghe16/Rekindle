import Link from "next/link";
import { BookOpen, Calculator, CalendarDays, Check, ClipboardList, CreditCard, FileText, Gauge, Handshake, Landmark, Megaphone, Menu, Music, QrCode, ReceiptText, Sparkles, Speaker, Store, ChartColumn } from "lucide-react";
import { HomeNav, SoonButton, SoonTile } from "@/components/paytm/nav";
import { Lockup, inr } from "@/components/paytm/ui";
import { getHomeStats } from "@/lib/vyapar/server/insights";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stats = await getHomeStats();
  return <div className="page">
    <header className="appbar">
      <SoonButton label="Menu" className="icon-btn" ariaLabel="Menu"><Menu /></SoonButton>
      <Lockup size="sm" />
      <span className="grow" />
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

      <Link className="vyapar-banner" href="/vyapar">
        <span className="bolt"><Sparkles /></span>
        <span><b>Vyapar AI: find buyers near you</b><span className="copy">{stats.nearbyBuyers} likely buyers within 5 km: {stats.nearbyPaytm} on Paytm, {stats.nearbyPublic} on the public map</span></span>
        <span className="cta">Try now</span>
      </Link>

      <section className="section">
        <div className="section-h"><h2>Grow Your Business</h2></div>
        <div className="grid-tiles">
          <Link className="tile ai" href="/vyapar"><span className="ribbon">AI · New</span><span className="ic"><Sparkles /></span>Vyapar AI</Link>
          <SoonTile label="Request Payment"><span className="ic"><ReceiptText /></span>Request Payment</SoonTile>
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
          <SoonTile label="Business loan"><span className="ic"><Calculator /></span>Loans</SoonTile>
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
