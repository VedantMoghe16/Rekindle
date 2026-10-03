import { CaptureWorkspace } from "@/components/capture/capture-workspace";

export const dynamic = "force-dynamic";

export default async function CapturePage({ searchParams }: { searchParams: Promise<{ account?: string | string[] }> }) {
  const { account } = await searchParams;
  const initialAccountId = Array.isArray(account) ? account[0] : account;
  return <div className="content"><div className="eyebrow">Remember</div><h1>Capture a conversation</h1><p className="subtitle">Turn email, WhatsApp, calls and notes into Revenue Memory.</p><CaptureWorkspace key={initialAccountId ?? "default"} initialAccountId={initialAccountId} /></div>;
}
