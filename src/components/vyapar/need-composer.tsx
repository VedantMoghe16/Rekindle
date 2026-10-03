"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search, Sparkles } from "lucide-react";
import { ProviderTag } from "@/components/paytm/ui";
import { toast } from "@/components/paytm/toast";

type Draft = { productKey: string | null; quantity: number | null; maxUnitPriceInr: number | null; neededBy: string | null; sampleFirst: boolean; backupSupplier: boolean };
const PRODUCTS = [["pastry_box", "Pastry boxes"], ["paper_bag", "Paper bags"], ["food_container", "Food containers"]] as const;
const EXAMPLE = "Need 500 grease-resistant pastry boxes by Friday, max ₹10 each. Sample first.";

/** Buyer types a need → we read it into fields → buyer confirms → publish. Nothing is shared before confirmation. */
export function NeedComposer() {
  const [text, setText] = useState(EXAMPLE);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [provider, setProvider] = useState("rules");
  const [busy, setBusy] = useState<"read" | "publish" | null>(null);
  const router = useRouter();

  async function read() {
    setBusy("read");
    const res = await fetch("/api/vyapar/needs/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (res?.ok) { setDraft(res.data.draft); setProvider(res.data.provider); }
    else { setDraft({ productKey: null, quantity: null, maxUnitPriceInr: null, neededBy: null, sampleFirst: false, backupSupplier: false }); toast(res?.error?.message ?? "Fill the fields below"); }
  }
  async function publish() {
    if (!draft?.productKey || !draft.quantity || !draft.neededBy) return toast("Add the product, quantity and date first");
    setBusy("publish");
    const res = await fetch("/api/vyapar/needs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rawInput: text, ...draft }) }).then((r) => r.json()).catch(() => null);
    if (res?.ok) router.push(`/buy/${res.data.needId}`);
    else { setBusy(null); toast(res?.error?.message ?? "Couldn't publish"); }
  }
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return <div className="card stack" style={{ gap: 10 }}>
    <b style={{ color: "var(--pt-navy)" }}>What do you need to buy?</b>
    <div className="prompt-box">
      <textarea value={text} onChange={(e) => { setText(e.target.value); setDraft(null); }} aria-label="What do you need?" />
      <div className="tools"><span className="xs muted">Type or paste in English or Hinglish</span><button className="round-btn go" onClick={read} disabled={busy !== null} aria-label="Read my request">{busy === "read" ? <LoaderCircle className="spin" /> : <Sparkles />}</button></div>
    </div>
    {draft && <div className="need-form rise">
      <div className="row"><b className="grow small">Check these details</b><span className="xs muted">Read by</span><ProviderTag provider={provider} /></div>
      <label>Product<select value={draft.productKey ?? ""} onChange={(e) => set({ productKey: e.target.value || null })}><option value="">Choose…</option>{PRODUCTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Quantity<input type="number" min={1} value={draft.quantity ?? ""} onChange={(e) => set({ quantity: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 500" /></label>
      <label>Needed by<input type="date" value={draft.neededBy ?? ""} onChange={(e) => set({ neededBy: e.target.value || null })} /></label>
      <label>Max price each (₹)<input type="number" min={0} step="0.5" value={draft.maxUnitPriceInr ?? ""} onChange={(e) => set({ maxUnitPriceInr: e.target.value ? Number(e.target.value) : null })} placeholder="Optional" /></label>
      <label className="check"><input type="checkbox" checked={draft.sampleFirst} onChange={(e) => set({ sampleFirst: e.target.checked })} />I want a sample first</label>
      <label className="check"><input type="checkbox" checked={draft.backupSupplier} onChange={(e) => set({ backupSupplier: e.target.checked })} />I have a supplier, looking for a backup</label>
      <button className="btn btn-primary btn-block" onClick={publish} disabled={busy !== null}>{busy === "publish" ? <LoaderCircle className="spin" /> : <Search />}Find offers</button>
      <span className="xs muted">Sellers only see this if you choose them. No one can message you unless you pick them.</span>
    </div>}
  </div>;
}
