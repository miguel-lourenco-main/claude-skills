// OpenStreetMap discovery via Overpass — free, no key, structured. Best SME coverage
// and the cleanest "has no website" signal (the `website` tag is simply absent).
// Area is geocoded to a bbox via Nominatim (also free, no key).

import { politeFetch } from "../lib/polite.mjs";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// vertical → OSM tag selectors
const TAGS = {
  restaurants: ['amenity=restaurant', 'amenity=fast_food'],
  cafes: ['amenity=cafe'],
  bars: ['amenity=bar', 'amenity=pub'],
  hotels: ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel', 'tourism=apartment'],
  beauty: ['shop=hairdresser', 'shop=beauty', 'amenity=spa'],
  fitness: ['leisure=fitness_centre', 'leisure=sports_centre'],
  dental: ['amenity=dentist'],
  clinics: ['amenity=clinic', 'amenity=doctors'],
  veterinary: ['amenity=veterinary'],
  legal: ['office=lawyer'],
  realEstate: ['office=estate_agent'],
  automotive: ['shop=car', 'shop=car_repair'],
  photography: ['craft=photographer', 'shop=photo'],
  events: ['amenity=events_venue', 'amenity=conference_centre'],
  trades: ['craft', 'shop=trade'],
  other: ['office'],
  hospitality: ['tourism=hotel', 'tourism=guest_house', 'amenity=restaurant'], // legacy
};

// OSM social tags → our social keys
const SOCIAL_TAGS = {
  "contact:facebook": "facebook", facebook: "facebook",
  "contact:instagram": "instagram", instagram: "instagram",
  "contact:twitter": "twitter", "contact:linkedin": "linkedin",
  "contact:youtube": "youtube", "contact:tiktok": "tiktok", "contact:whatsapp": "whatsapp",
};

function extractSocial(t) {
  const social = {};
  for (const [tag, key] of Object.entries(SOCIAL_TAGS)) if (t[tag] && !social[key]) social[key] = t[tag];
  return social;
}

async function bboxFor(area) {
  const url = `${NOMINATIM}?format=json&limit=1&countrycodes=pt&q=${encodeURIComponent(area)}`;
  // Nominatim is an API (their usage policy: ≤1 req/s + identifying UA, which politeFetch
  // enforces); robots.txt there targets crawlers of the map tiles, not API clients.
  const r = await politeFetch(url, { headers: { accept: "application/json" } }, { robots: false });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j[0]?.boundingbox) return null;
  const [s, n, w, e] = j[0].boundingbox.map(Number); // [south, north, west, east]
  return { s, n, w, e };
}

function buildQuery(tags, bb, limit) {
  const sels = tags.map((t) => {
    const [k, v] = t.split("=");
    const sel = v ? `["${k}"="${v}"]` : `["${k}"]`;
    return `nwr${sel}["name"](${bb.s},${bb.w},${bb.n},${bb.e});`;
  }).join("");
  return `[out:json][timeout:25];(${sels});out center tags ${limit};`;
}

export async function discover(scope) {
  const area = scope.area || scope.cities?.[0] || scope.districts?.[0] || "Portugal";
  const verticals = scope.vertical ? [scope.vertical] : scope.verticals ?? ["hospitality"];
  const bb = await bboxFor(area);
  if (!bb) return [];

  // fetch a bit more than the target so dedupe/merge still lands near the requested count
  const limit = Math.min(250, Math.max(20, (scope.count ?? 60) * 2));
  const out = [];
  for (const v of verticals) {
    const q = buildQuery(TAGS[v] ?? TAGS.other, bb, limit);
    let j;
    try {
      const r = await politeFetch(OVERPASS, { method: "POST", body: `data=${encodeURIComponent(q)}`, headers: { "content-type": "application/x-www-form-urlencoded" }, timeout: 45000 }, { robots: false });
      if (!r.ok) continue;
      j = await r.json();
    } catch { continue; }
    for (const el of j.elements ?? []) {
      const t = el.tags ?? {};
      if (!t.name) continue;
      const site = t.website || t["contact:website"] || null;
      const phones = [...new Set([t.phone, t["contact:phone"], t["contact:mobile"]].filter(Boolean))];
      out.push({
        name: t.name,
        vertical: v,
        location: { city: t["addr:city"] || area, district: t["addr:district"] || scope.district || null, lat: el.lat ?? el.center?.lat, lng: el.lon ?? el.center?.lon },
        contacts: { website: site, email: t.email || t["contact:email"] || null, phone: phones[0] || null, phones, social: extractSocial(t) },
        hasWebsite: !!site,
        source: "osm",
        sourceConfidence: 0.7,
      });
    }
  }
  return out;
}
