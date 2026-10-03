import { notFound } from "next/navigation";
import { isCogneeConfigured } from "@/lib/providers/cognee";
import { PLAYS } from "@/lib/vyapar/counter";
import { ChatThread } from "@/components/vyapar/chat-thread";
import { demoReplies, getThread } from "@/lib/vyapar/server/conversation";

export const dynamic = "force-dynamic";

const PLAY_LABELS = Object.fromEntries(Object.values(PLAYS).flat().map((p) => [p.id, p.label]));

export default async function DealChat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thread = await getThread(id);
  if (!thread) notFound();
  return <ChatThread
    dealId={id}
    merchant={{ id: thread.merchant.id, name: thread.merchant.name, ownerName: thread.merchant.ownerName }}
    stage={thread.deal.stage}
    autopilot={thread.deal.autopilot}
    items={thread.items.map((i) => ({ ...i, at: i.at.toISOString() }))}
    demoReplies={demoReplies(thread.merchant.name, thread.deal.stage)}
    playLabels={PLAY_LABELS}
    memoryProvider={isCogneeConfigured() ? "cognee" : "local"}
  />;
}
