import { db } from "@/lib/db";
import { SettingsForms } from "@/components/settings/settings-forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const seller = await db.sellerProfile.findFirst();
  const list = (json?: string) => (json ? JSON.parse(json) as unknown[] : []);
  const missing = await db.memory.findMany({ where: { stallCategory: "MISSING_FEATURE" }, include: { deal: { include: { account: true } } } });
  const requested = missing.map((memory) => ({ account: memory.deal.account.name, feature: JSON.parse(memory.missingFeatureJson) as { description: string | null; feature_key: string | null } })).filter((item) => item.feature.feature_key);
  return <div className="content">
    <div className="eyebrow">Settings</div>
    <h1>{seller?.name ?? "Seller"} profile</h1>
    <p className="subtitle">{seller?.oneLiner}</p>
    <div className="settings-grid">
      <section className="panel">
        <h2>What Rekindle knows about you</h2>
        <div className="field"><div className="field-label">Product</div><div className="field-value">{seller?.product}</div></div>
        <div className="field"><div className="field-label">Ideal customer</div><div className="field-value">{seller?.icp}</div></div>
        <div className="field"><div className="field-label">Personas</div><div className="chip-row">{(list(seller?.personasJson) as string[]).map((item) => <span className="criteria-chip" key={item}>{item}</span>)}</div></div>
        <div className="field"><div className="field-label">Proof points (the only claims campaigns may make)</div><ul className="plain-list">{(list(seller?.proofPointsJson) as string[]).map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div className="field"><div className="field-label">Hiring keywords that count as a buying signal</div><div className="chip-row">{(list(seller?.roleKeywordsJson) as string[]).map((item) => <span className="criteria-chip" key={item}>{item}</span>)}</div></div>
        <div className="field"><div className="field-label">Changelog</div><ul className="plain-list">{(list(seller?.changelogJson) as { date: string; title: string; featureKey: string }[]).map((item) => <li key={item.featureKey + item.date}><strong>{item.title}</strong> <span className="meta">{item.date} · {item.featureKey}</span></li>)}</ul></div>
        {requested.length > 0 && <div className="field"><div className="field-label">Features buyers asked for</div><ul className="plain-list">{requested.map((item) => <li key={item.account}>{item.account}: {item.feature.description} <span className="meta">{item.feature.feature_key}</span></li>)}</ul></div>}
      </section>
      <SettingsForms />
    </div>
  </div>;
}
