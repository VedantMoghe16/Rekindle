"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed } from "lucide-react";
import type { Map as LMap, CircleMarker, Circle } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPin = { id: string; href?: string; label: string; score: number | null; lat: number; lng: number; state: "hot" | "warm" | "pub" | "out" | "done"; pulse?: boolean };

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/**
 * Real map (OpenStreetMap tiles via Leaflet): your shop, the search radius, every merchant at its real
 * coordinates, and your live location from the browser (blue dot), which can recentre the map.
 */
export function LiveMap({ seller, pins, radiusKm }: { seller: { lat: number; lng: number; name: string }; pins: MapPin[]; radiusKm: number }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const me = useRef<{ dot: CircleMarker; acc: Circle } | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let watch: number | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([seller.lat, seller.lng], 13);
      map.current = m;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      L.control.zoom({ position: "bottomright" }).addTo(m);
      // Search radius rings around your shop.
      for (const f of [1 / 3, 2 / 3, 1]) L.circle([seller.lat, seller.lng], { radius: radiusKm * f * 1000, color: "#00b9f1", weight: f === 1 ? 1.5 : 1, dashArray: f === 1 ? undefined : "4 6", fillOpacity: f === 1 ? 0.04 : 0 }).addTo(m);
      L.marker([seller.lat, seller.lng], { icon: L.divIcon({ className: "lmap-shop", html: "<span>🏪</span>", iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: 1000, title: `${seller.name} (your shop)` }).addTo(m).bindTooltip(`${seller.name} · your shop`);
      for (const p of pins) {
        const icon = L.divIcon({ className: `lmap-pin ${p.state}${p.pulse ? " pulse" : ""}`, html: `<span><b>${p.score ?? "–"}</b></span>`, iconSize: [30, 30], iconAnchor: [15, 30] });
        const mk = L.marker([p.lat, p.lng], { icon, title: p.label, zIndexOffset: p.state === "out" ? -100 : 0 }).addTo(m).bindTooltip(p.label, { direction: "top", offset: [0, -28] });
        if (p.href) mk.on("click", () => router.push(p.href!));
      }
      // Fit the search radius; re-measure once layout settles (the card animates in), and whenever the box resizes.
      const fit = () => { m.invalidateSize(); m.fitBounds(L.latLng(seller.lat, seller.lng).toBounds(radiusKm * 2000 * 1.05), { padding: [4, 4] }); };
      fit();
      setTimeout(fit, 350);
      const ro = new ResizeObserver(() => m.invalidateSize());
      ro.observe(box.current);
      m.once("unload", () => ro.disconnect());

      // Live location: a blue dot that follows you (asks the browser for permission).
      if ("geolocation" in navigator) {
        watch = navigator.geolocation.watchPosition((pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          setHere(p);
          setGeoError(null);
          if (!me.current) me.current = { acc: L.circle([p.lat, p.lng], { radius: p.accuracy, color: "#1a73e8", weight: 0, fillOpacity: 0.12 }).addTo(m), dot: L.circleMarker([p.lat, p.lng], { radius: 7, color: "#fff", weight: 2.5, fillColor: "#1a73e8", fillOpacity: 1 }).addTo(m).bindTooltip("You are here") };
          else { me.current.dot.setLatLng([p.lat, p.lng]); me.current.acc.setLatLng([p.lat, p.lng]).setRadius(p.accuracy); }
        }, (err) => setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission is off" : "Couldn't get your location"), { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 });
      }
    })();
    return () => { cancelled = true; if (watch !== null) navigator.geolocation.clearWatch(watch); map.current?.remove(); map.current = null; me.current = null; };
  }, [seller.lat, seller.lng, seller.name, radiusKm, pins, router]);

  const away = here ? km(here, seller) : null;
  return <div className="lmap-wrap">
    <div ref={box} className="lmap" role="region" aria-label={`Map of buyers within ${radiusKm} km of ${seller.name}`} />
    <button className="lmap-locate" onClick={() => { if (here) map.current?.flyTo([here.lat, here.lng], 15); else if (geoError) alert(`${geoError}. Allow location for this site in your browser settings.`); }} aria-label="Show my location" title={here ? "Show my location" : geoError ?? "Finding you…"}><LocateFixed size={18} /></button>
    {away !== null && away > 2 && <div className="lmap-note">You&apos;re {away < 100 ? away.toFixed(1) : Math.round(away)} km from {seller.name}. Shops are ranked by distance from your shop.</div>}
  </div>;
}
