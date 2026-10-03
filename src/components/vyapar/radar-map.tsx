import Link from "next/link";
import { Package } from "lucide-react";

export type Pin = { id: string; href?: string; label: string; score: number | null; x: number; y: number; state: "hot" | "warm" | "pub" | "out" | "done"; pulse?: boolean };

/** Radar of nearby merchants: rings at fractions of the search radius, seller in the middle. */
export function RadarMap({ pins, radiusKm }: { pins: Pin[]; radiusKm: number }) {
  const ring = (km: number) => `${(km / (radiusKm * 1.25)) * 100}%`;
  const rings = [radiusKm / 5, (radiusKm * 3) / 5, radiusKm].map((km) => Math.round(km * 10) / 10);
  return <div className="map" role="img" aria-label={`Map of buyers within ${radiusKm} km`}>
    <svg className="roads" viewBox="0 0 360 232" preserveAspectRatio="none" aria-hidden>
      <path d="M0 160 C 90 140, 150 120, 360 70" stroke="#fff" strokeWidth="10" fill="none" />
      <path d="M120 0 C 140 80, 170 150, 150 232" stroke="#fff" strokeWidth="8" fill="none" />
      <path d="M0 40 L 360 200" stroke="#fff" strokeWidth="5" fill="none" />
      <path d="M262 0 L 300 232" stroke="#fff" strokeWidth="4" fill="none" />
    </svg>
    {rings.map((km) => <div key={km} className="ring" style={{ height: ring(km) }}><span>{km} km</span></div>)}
    <div className="me" title="You"><Package /></div>
    {pins.map((p) => {
      const cls = `pin ${p.state}${p.pulse ? " pulse" : ""}`;
      const head = <span className="head">{p.score ?? "–"}</span>;
      return p.href
        ? <Link key={p.id} href={p.href} className={cls} style={{ left: `${p.x}%`, top: `${p.y}%` }} title={p.label}>{head}</Link>
        : <span key={p.id} className={cls} style={{ left: `${p.x}%`, top: `${p.y}%` }} title={p.label}>{head}</span>;
    })}
  </div>;
}
