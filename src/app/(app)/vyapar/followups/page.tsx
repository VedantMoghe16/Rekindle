import { AppBar } from "@/components/paytm/ui";
import { VyaparTabs } from "@/components/paytm/nav";
import { FollowupQueue } from "@/components/vyapar/followup-queue";
import { ensureFollowupWorker, getFollowupQueue, planFollowups } from "@/lib/vyapar/server/followups";

export const dynamic = "force-dynamic";

export default async function FollowupsPage() {
  ensureFollowupWorker();
  await planFollowups().catch(() => null);
  const q = await getFollowupQueue();
  return <div className="page">
    <AppBar title="Follow-ups" sub="Quiet and lost leads, with you in the loop" back="/vyapar/deals" />
    <main className="scroll"><div className="pad">
      <FollowupQueue initial={JSON.parse(JSON.stringify(q))} />
    </div></main>
    <VyaparTabs />
  </div>;
}
