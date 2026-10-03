"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send, X } from "lucide-react";
import { toast } from "@/components/paytm/toast";

export function RequestReply({ id, draft, done }: { id: string; draft: string; done: boolean }) {
  const [text, setText] = useState(draft);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const router = useRouter();
  async function act(action: "accept" | "decline") {
    setBusy(action);
    const res = await fetch(`/api/vyapar/requests/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "accept" ? { action, text } : { action }) }).then((r) => r.json()).catch(() => null);
    if (!res?.ok) { setBusy(null); return toast(res?.error?.message ?? "Couldn't respond"); }
    if (action === "decline") { toast("Declined"); router.push("/vyapar/deals"); return; }
    toast("Reply sent. Sample booked");
    router.push(`/vyapar/deals/${res.data.dealId}`);
  }
  return <>
    <main className="scroll"><div className="pad">
      <div className="card stack">
        <div className="card-title">Your reply <span className="xs muted">only uses the buyer&apos;s request and your offer</span></div>
        <textarea className="draft-edit" value={text} onChange={(e) => setText(e.target.value)} disabled={done} aria-label="Reply to buyer" />
      </div>
      <p className="xs muted" style={{ textAlign: "center" }}>The buyer picked you for this request, so you may reply. In the demo it is delivered to the team Telegram chat.</p>
    </div></main>
    {!done && <div className="sticky-cta">
      <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => act("decline")} disabled={busy !== null}>{busy === "decline" ? <LoaderCircle className="spin" /> : <X />}Decline</button>
      <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => act("accept")} disabled={busy !== null}>{busy === "accept" ? <LoaderCircle className="spin" /> : <Send />}Accept &amp; send</button>
    </div>}
  </>;
}
