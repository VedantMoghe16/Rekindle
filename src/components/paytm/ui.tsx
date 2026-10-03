import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function Lockup({ size = "md" }: { size?: "sm" | "md" }) {
  return <span className={`lockup${size === "sm" ? " sm" : ""}`} aria-label="Paytm for Business"><span className="wordmark"><span className="pay">pay</span><span className="tm">tm</span></span><span className="for">for</span><span className="biz">Business</span></span>;
}

export function AppBar({ title, sub, back, right }: { title: string; sub?: string; back?: string; right?: React.ReactNode }) {
  return <header className="appbar">
    {back && <Link className="icon-btn" href={back} aria-label="Back"><ChevronLeft /></Link>}
    <div className="titles"><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
    {right}
  </header>;
}

const PALETTE = ["#f79009", "#7a5af8", "#ec184a", "#12b76a", "#0098d1", "#d444f1", "#0e9384", "#e04f16", "#2e90fa"];
export function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
export function initials(name: string) {
  return name.replace(/[^A-Za-z\s&]/g, "").split(/\s+/).filter((w) => w && w !== "&").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
export function Avatar({ name, round, className = "" }: { name: string; round?: boolean; className?: string }) {
  return <span className={`avatar${round ? " round" : ""} ${className}`} style={{ background: colorFor(name) }}>{initials(name)}</span>;
}

export function ScoreRing({ value, label = "FIT" }: { value: number; label?: string }) {
  const color = value >= 85 ? "var(--pt-green)" : value >= 70 ? "var(--pt-cyan)" : "var(--pt-amber)";
  return <div className="score"><b style={{ background: `conic-gradient(${color} ${value}%, var(--pt-line) 0)` }}><span>{value}</span></b><small>{label}</small></div>;
}

const TAG_NAMES: Record<string, string> = { claude: "Claude", sarvam: "Sarvam", "sarvam-tts": "Sarvam", cognee: "Cognee", n8n: "n8n", paytm: "Paytm", rules: "Rules", template: "Template", simulated: "Simulated", local: "Local", cached: "Cached", human: "You" };
export function ProviderTag({ provider }: { provider: string }) {
  const cls = provider === "sarvam-tts" ? "sarvam" : provider;
  return <span className={`tag ${cls}`}>{TAG_NAMES[provider] ?? provider}</span>;
}

export function StatusNotch() {
  return <div className="device-notch" aria-hidden><span>9:41</span><span className="island" /><span className="sys"><i style={{ height: 4 }} /><i style={{ height: 6 }} /><i style={{ height: 8 }} /><i style={{ height: 10 }} /></span></div>;
}

export function timeLabel(d: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(d);
}
export function dayLabel(d: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(d);
}
export function inr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}
