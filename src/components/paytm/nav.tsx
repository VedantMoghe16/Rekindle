"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Brain, Handshake, House, ReceiptText, ScanLine, Search, Sparkles, User } from "lucide-react";
import { toast } from "@/components/paytm/toast";

const soon = (what: string) => () => toast(`${what} is part of the main Paytm app, not this prototype`);

/** The app's own navigation: always at the bottom of every main screen, Vyapar AI included. */
export function HomeNav() {
  const pathname = usePathname();
  const vyapar = pathname.startsWith("/vyapar");
  return <nav className="bottomnav">
    <Link className={vyapar ? "" : "on"} href="/"><House />Home</Link>
    <button onClick={soon("Payments")}><ReceiptText />Payments</button>
    <button onClick={soon("Scan & Pay")} aria-label="Scan"><span className="scan"><ScanLine /></span></button>
    <Link className={vyapar ? "on" : ""} href="/vyapar"><Sparkles />Vyapar AI</Link>
    <button onClick={soon("Profile")}><User />Profile</button>
  </nav>;
}

const TABS = [
  { href: "/vyapar", label: "Find", Icon: Search, match: (p: string) => p === "/vyapar" || p.startsWith("/vyapar/hunts") || p.startsWith("/vyapar/leads") },
  { href: "/vyapar/fleet", label: "AI team", Icon: Bot, match: (p: string) => p.startsWith("/vyapar/fleet") || p.startsWith("/vyapar/onboarding") },
  { href: "/vyapar/deals", label: "Deals", Icon: Handshake, match: (p: string) => p.startsWith("/vyapar/deals") || p.startsWith("/vyapar/merchants") || p.startsWith("/vyapar/requests") || p.startsWith("/vyapar/followups") },
  { href: "/vyapar/memory", label: "Memory", Icon: Brain, match: (p: string) => p.startsWith("/vyapar/memory") || p.startsWith("/vyapar/business") || p.startsWith("/vyapar/campaigns") },
];

/** Sections inside Vyapar AI: a tab strip under the title (the bottom bar stays the app's). */
export function VyaparTabs() {
  const pathname = usePathname();
  return <nav className="top-tabs" aria-label="Vyapar AI sections">{TABS.map(({ href, label, Icon, match }) => <Link key={href} href={href} className={match(pathname) ? "on" : ""} aria-current={match(pathname) ? "page" : undefined}><Icon />{label}</Link>)}</nav>;
}

export function SoonTile({ label, children, className = "tile" }: { label: string; children: React.ReactNode; className?: string }) {
  return <button className={className} onClick={soon(label)}>{children}</button>;
}

export function SoonButton({ label, className, children, ariaLabel }: { label: string; className?: string; children: React.ReactNode; ariaLabel?: string }) {
  return <button className={className} onClick={soon(label)} aria-label={ariaLabel}>{children}</button>;
}
