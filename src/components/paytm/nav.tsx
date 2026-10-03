"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Brain, Handshake, House, ReceiptText, ScanLine, Search, Sparkles, User } from "lucide-react";
import { toast } from "@/components/paytm/toast";

const soon = (what: string) => () => toast(`${what} is part of the main Paytm app, not this prototype`);

export function HomeNav() {
  return <nav className="bottomnav">
    <Link className="on" href="/"><House />Home</Link>
    <button onClick={soon("Payments")}><ReceiptText />Payments</button>
    <button onClick={soon("Scan & Pay")} aria-label="Scan"><span className="scan"><ScanLine /></span></button>
    <Link href="/vyapar"><Sparkles />Vyapar AI</Link>
    <button onClick={soon("Profile")}><User />Profile</button>
  </nav>;
}

const TABS = [
  { href: "/vyapar", label: "Find", Icon: Search, match: (p: string) => p === "/vyapar" || p.startsWith("/vyapar/hunts") || p.startsWith("/vyapar/leads") },
  { href: "/vyapar/fleet", label: "AI team", Icon: Bot, match: (p: string) => p.startsWith("/vyapar/fleet") || p.startsWith("/vyapar/onboarding") },
  { href: "/vyapar/deals", label: "Deals", Icon: Handshake, match: (p: string) => p.startsWith("/vyapar/deals") || p.startsWith("/vyapar/merchants") || p.startsWith("/vyapar/requests") },
  { href: "/vyapar/memory", label: "Memory", Icon: Brain, match: (p: string) => p.startsWith("/vyapar/memory") },
];

export function VyaparTabs() {
  const pathname = usePathname();
  return <nav className="bottomnav four">{TABS.map(({ href, label, Icon, match }) => <Link key={href} href={href} className={match(pathname) ? "on" : ""}><Icon />{label}</Link>)}</nav>;
}

export function SoonTile({ label, children, className = "tile" }: { label: string; children: React.ReactNode; className?: string }) {
  return <button className={className} onClick={soon(label)}>{children}</button>;
}

export function SoonButton({ label, className, children, ariaLabel }: { label: string; className?: string; children: React.ReactNode; ariaLabel?: string }) {
  return <button className={className} onClick={soon(label)} aria-label={ariaLabel}>{children}</button>;
}
