/** Great-circle distance in kilometres. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Position on a square radar map (0–100%), centred on the seller, where the edge is `radiusKm * 1.25`. */
export function radarPosition(origin: { lat: number; lng: number }, point: { lat: number; lng: number }, radiusKm: number) {
  const kmPerLat = 111;
  const kmPerLng = 111 * Math.cos((origin.lat * Math.PI) / 180);
  const dx = (point.lng - origin.lng) * kmPerLng;
  const dy = (point.lat - origin.lat) * kmPerLat;
  const scale = 50 / (radiusKm * 1.25);
  const clamp = (v: number) => Math.max(4, Math.min(96, v));
  return { x: clamp(50 + dx * scale), y: clamp(50 - dy * scale) };
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
