"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Message = { kind: "ok" | "error"; text: string } | null;

export function SettingsForms() {
  const router = useRouter();
  const [change, setChange] = useState({ title: "", featureKey: "" });
  const [account, setAccount] = useState({ name: "", domain: "", industry: "", city: "", careersProvider: "greenhouse", careersToken: "", dealValueInr: "", contactName: "", contactTitle: "" });
  const [changeMsg, setChangeMsg] = useState<Message>(null);
  const [accountMsg, setAccountMsg] = useState<Message>(null);
  const [busy, setBusy] = useState("");

  async function post(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return response.json();
  }

  async function shipFeature() {
    setBusy("change"); setChangeMsg(null);
    const body = await post("/api/settings/changelog", change);
    setBusy("");
    if (!body.ok) { setChangeMsg({ kind: "error", text: body.error.message }); return; }
    const moved = (body.data.laneChanges as { accountName: string; toLane: string }[]).map((c) => `${c.accountName} → ${c.toLane}`).join(", ");
    setChangeMsg({ kind: "ok", text: `Shipped. ${body.data.signalsAdded} deal(s) matched this feature${moved ? `: ${moved}` : ""}.` });
    setChange({ title: "", featureKey: "" });
    router.refresh();
  }

  async function testBoard() {
    setBusy("test"); setAccountMsg(null);
    const body = await post("/api/careers/test", { provider: account.careersProvider, token: account.careersToken });
    setBusy("");
    setAccountMsg(body.ok ? { kind: "ok", text: `Board found: ${body.data.jobCount} open roles${body.data.sample.length ? ` (e.g. ${body.data.sample.slice(0, 3).join(", ")})` : ""}.` } : { kind: "error", text: body.error.message });
  }

  async function addAccount() {
    setBusy("add"); setAccountMsg(null);
    const body = await post("/api/accounts", { ...account, dealValueInr: Math.round(Number(account.dealValueInr || 0) * 100_000), careersProvider: account.careersToken ? account.careersProvider : "none" });
    setBusy("");
    if (!body.ok) { setAccountMsg({ kind: "error", text: body.error.message }); return; }
    router.push(`/capture?account=${body.data.accountId}`);
  }

  const field = (key: keyof typeof account, label: string, placeholder = "") => <label className="form-field"><span className="field-label">{label}</span><input value={account[key]} placeholder={placeholder} onChange={(e) => setAccount({ ...account, [key]: e.target.value })} /></label>;

  return <div className="settings-forms">
    <section className="panel">
      <h2>Ship a feature</h2>
      <p className="meta">Deals that stalled on a missing feature are re-checked the moment it ships.</p>
      <label className="form-field"><span className="field-label">What shipped</span><input value={change.title} placeholder="SOC 2 Type II evidence export" onChange={(e) => setChange({ ...change, title: e.target.value })} /></label>
      <label className="form-field"><span className="field-label">Feature key</span><input value={change.featureKey} placeholder="soc2_type2_export" onChange={(e) => setChange({ ...change, featureKey: e.target.value.toLowerCase() })} /></label>
      <button className="button primary" disabled={busy === "change" || change.title.length < 3 || change.featureKey.length < 2} onClick={shipFeature}>{busy === "change" ? "Re-checking deals…" : "Add to changelog"}</button>
      {changeMsg && <p className={changeMsg.kind === "error" ? "error" : "success"}>{changeMsg.text}</p>}
    </section>
    <section className="panel">
      <h2>Add a real account</h2>
      <p className="meta">Add a company with a public job board and Rekindle will watch it for live hiring signals.</p>
      {field("name", "Company", "Postman")}
      {field("domain", "Domain", "postman.com")}
      <div className="form-row">{field("industry", "Industry", "SaaS")}{field("city", "City", "Bengaluru")}</div>
      <div className="form-row">
        <label className="form-field"><span className="field-label">Job board</span><select value={account.careersProvider} onChange={(e) => setAccount({ ...account, careersProvider: e.target.value })}><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option></select></label>
        {field("careersToken", "Board token", "postman")}
      </div>
      <button className="button" disabled={busy === "test" || !account.careersToken} onClick={testBoard}>{busy === "test" ? "Checking…" : "Test board"}</button>
      <div className="form-row">{field("dealValueInr", "Deal value (₹ lakh)", "12")}{field("contactName", "Contact", "Name")}</div>
      {field("contactTitle", "Contact title", "VP Engineering")}
      <button className="button primary" disabled={busy === "add" || account.name.trim().length < 2} onClick={addAccount}>{busy === "add" ? "Adding…" : "Add account and capture a conversation"}</button>
      {accountMsg && <p className={accountMsg.kind === "error" ? "error" : "success"}>{accountMsg.text}</p>}
    </section>
  </div>;
}
