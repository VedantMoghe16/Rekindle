"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { DraftPanel } from "@/components/brief/draft-panel";

export type ColdItem = { dealId: string; accountId: string; accountName: string; industry: string | null; daysSilent: number; valueLabel: string; lastChannel: string | null; stallCategory: string | null; nudge: string; recommendationId: string | null; lane: string };

const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", call: "Call", meeting: "Meeting", note: "Note" };

function ColdRow({ item }: { item: ColdItem }) {
  const [open, setOpen] = useState(false);
  return <div className="cold-row">
    <div className="cold-main">
      <div><strong><Link href={`/accounts/${item.accountId}`}>{item.accountName}</Link></strong><div className="meta">{item.industry}{item.stallCategory ? ` · ${item.stallCategory.toLowerCase().replaceAll("_", " ")}` : ""}</div></div>
      <div className="cold-days"><strong>{item.daysSilent}</strong> days silent<div className="meta">last via {item.lastChannel ? CHANNEL[item.lastChannel] ?? item.lastChannel : "unknown"}</div></div>
      <div className="cold-value"><strong>{item.valueLabel}</strong><div className="meta">at risk</div></div>
      <span className={`lane ${item.lane.toLowerCase()}`}>{item.lane}</span>
      <button className="button" onClick={() => setOpen((value) => !value)}><MessageSquareText /> {open ? "Hide" : "Draft nudge"}</button>
    </div>
    <div className="meta cold-nudge">{item.nudge}</div>
    {open && <DraftPanel recommendationId={item.recommendationId} dealId={item.dealId} defaultChannel={item.lastChannel === "email" ? "email" : "whatsapp"} autoGenerate />}
  </div>;
}

export function ColdList({ items, initial = 5 }: { items: ColdItem[]; initial?: number }) {
  const [all, setAll] = useState(false);
  const visible = all ? items : items.slice(0, initial);
  return <div className="cold-list">
    {visible.map((item) => <ColdRow key={item.dealId} item={item} />)}
    {items.length > initial && <button className="button cold-more" onClick={() => setAll((value) => !value)}>{all ? "Show fewer" : `Show all ${items.length}`}</button>}
  </div>;
}
