"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, ClipboardCheck, Flame, Inbox, ListFilter, RefreshCcw, Search, Settings } from "lucide-react";

const primary = [
  ["Find accounts", "/discover", Search], ["Leads", "/leads", ListFilter], ["Today", "/today", Flame], ["Accounts", "/accounts", Building2], ["Conversations", "/capture", Inbox], ["Insights & Campaigns", "/insights", BarChart3],
] as const;
const secondary = [["Revenue Loop", "/loop", RefreshCcw], ["Pipeline Audit", "/audit", ClipboardCheck], ["Settings", "/settings", Settings]] as const;

export function Sidebar() {
  const pathname = usePathname();
  return <aside className="sidebar">
    <Link className="brand" href="/today"><Image src="/logo.svg" width={40} height={40} alt="" />Rekindle</Link>
    <div className="nav-label">Workspace</div>
    <nav className="nav">{primary.map(([label, href, Icon]) => <Link className={pathname.startsWith(href) ? "active" : ""} href={href} key={href}><Icon />{label}</Link>)}</nav>
    <div className="nav-label">Measure</div>
    <nav className="nav">{secondary.map(([label, href, Icon]) => <Link className={pathname.startsWith(href) ? "active" : ""} href={href} key={href}><Icon />{label}</Link>)}</nav>
    <div className="sidebar-foot"><span className="workspace-dot" />Demo workspace<br />CloudKavach · Ananya Rao</div>
  </aside>;
}
