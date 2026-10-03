import Link from "next/link";
import { Bot, ChevronRight } from "lucide-react";
import { AppBar } from "@/components/paytm/ui";
import { VyaparTabs } from "@/components/paytm/nav";
import { FleetConsole } from "@/components/vyapar/fleet-console";
import { ensureWorker, getDemoContacts, getFleetRun } from "@/lib/vyapar/server/fleet";
import { getOnboarding } from "@/lib/vyapar/server/onboarding";

export const dynamic = "force-dynamic";

export default async function FleetPage() {
  const [run, contacts, o] = await Promise.all([getFleetRun(), getDemoContacts(), getOnboarding()]);
  if (run) ensureWorker(run);
  return <div className="page">
    <AppBar title="AI sales team" sub="Finds, pitches and calls for you" back="/vyapar" />
    <main className="scroll"><div className="pad">
      <Link href="/vyapar/onboarding" className="card row" style={{ gap: 10 }}>
        <Bot size={20} color="var(--pt-cyan-600)" />
        <div className="grow"><b style={{ fontSize: 13.5 }}>{o.saved ? "Your business brief" : "Set up your business brief"}</b><div className="xs muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.brief.summary}</div></div>
        <ChevronRight size={18} />
      </Link>
      <FleetConsole initialRun={run ? JSON.parse(JSON.stringify(run)) : null} contacts={contacts.map((c) => ({ priority: c.priority, phone: c.phone, telegramChatId: c.telegramChatId }))} briefed={o.saved} />
    </div></main>
    <VyaparTabs />
  </div>;
}
