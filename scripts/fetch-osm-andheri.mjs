// Snapshot real businesses around Andheri from OpenStreetMap (© OpenStreetMap contributors, ODbL).
// Usage: node scripts/fetch-osm-andheri.mjs   → writes data/andheri-osm.json
// Only public map facts are kept (name, category, location, street, cuisine, hours, brand). No phones or people.
import { writeFileSync } from "node:fs";

const CENTER = { lat: 19.1150, lng: 72.8560 }; // EcoPack Solutions (demo seller), Andheri East
const RADIUS_M = 4500;
const MIRRORS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const SHOP = "bakery|confectionery|pastry|deli|dairy|convenience|supermarket|general|greengrocer|florist|chemist|hardware|clothes|mobile_phone|electronics|beauty|hairdresser";
const AMENITY = "cafe|restaurant|fast_food|ice_cream|pharmacy";
const query = `[out:json][timeout:90];(nwr["shop"~"^(${SHOP})$"](around:${RADIUS_M},${CENTER.lat},${CENTER.lng});nwr["amenity"~"^(${AMENITY})$"](around:${RADIUS_M},${CENTER.lat},${CENTER.lng}););out tags center;`;

const CATEGORY = {
  bakery: "Bakery", pastry: "Bakery", deli: "Bakery", confectionery: "Sweet shop", dairy: "Dairy",
  convenience: "Grocery", supermarket: "Grocery", general: "Grocery", greengrocer: "Grocery",
  florist: "Florist", chemist: "Pharmacy", pharmacy: "Pharmacy", hardware: "Hardware", clothes: "Clothing",
  mobile_phone: "Electronics", electronics: "Electronics", beauty: "Salon", hairdresser: "Salon",
  cafe: "Cafe", restaurant: "Restaurant", fast_food: "Fast food", ice_cream: "Ice cream",
};
// National chains buy packaging centrally; the engine excludes them with that reason.
const CHAINS = /\b(mcdonald|domino|cafe coffee day|\bccd\b|barista|starbucks|kfc|subway|pizza hut|burger king|theobroma|haldiram|apollo|medplus|wellness forever|reliance|d-?mart|big bazaar|more\b|star bazaar|spencer|natural'?s|baskin|chaayos|tea villa|wow! momo|faasos|behrouz|frankie|jumbo king|goli|mad over donuts|monginis|krispy|dunkin|naturals|nature'?s basket|tata|croma|vijay sales|zudio|westside|lenskart|bata|sangeetha|poorvika|lakme|jawed habib|wagh bakari|third wave|blue tokai|smoke house|social|irani cafe chain)\b/i;

let data = null;
for (const url of MIRRORS) {
  try {
    const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: query }), headers: { "User-Agent": "VyaparAIDemo/0.1 (hackathon prototype)" }, signal: AbortSignal.timeout(100_000) });
    const text = await res.text();
    if (text.startsWith("{")) { data = JSON.parse(text); console.log(`fetched from ${url}`); break; }
    console.log(`mirror failed: ${url} (${res.status})`);
  } catch (error) { console.log(`mirror error: ${url} ${error.message}`); }
}
if (!data) throw new Error("All Overpass mirrors failed; keep the existing snapshot.");

const seen = new Set();
const places = [];
for (const el of data.elements) {
  const t = el.tags ?? {};
  const name = (t.name ?? t["name:en"] ?? "").trim();
  const kind = t.shop ?? t.amenity;
  const category = CATEGORY[kind];
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!name || !category || lat == null || lng == null || name.length < 3) continue;
  const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  places.push({
    osmId: `${el.type}/${el.id}`, name, category, osmTag: `${t.shop ? "shop" : "amenity"}=${kind}`,
    lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)),
    street: t["addr:street"] ?? null, suburb: t["addr:suburb"] ?? t["addr:neighbourhood"] ?? null, postcode: t["addr:postcode"] ?? null,
    cuisine: t.cuisine ? t.cuisine.split(";").slice(0, 3).join(", ").replace(/_/g, " ") : null,
    openingHours: t.opening_hours ?? null, website: t.website ?? t["contact:website"] ?? null,
    brand: t.brand ?? (CHAINS.test(name) ? name : null),
  });
}
places.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync("data/andheri-osm.json", JSON.stringify({ source: "OpenStreetMap contributors", license: "ODbL 1.0", licenseUrl: "https://www.openstreetmap.org/copyright", observedAt: new Date().toISOString().slice(0, 10), center: CENTER, radiusM: RADIUS_M, places }, null, 1) + "\n");
const counts = places.reduce((m, p) => ((m[p.category] = (m[p.category] ?? 0) + 1), m), {});
console.log(`${places.length} places`, counts, `${places.filter((p) => p.brand).length} chains`);
