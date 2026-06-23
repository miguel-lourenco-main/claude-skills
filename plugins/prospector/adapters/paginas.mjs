// Páginas Amarelas (PAI.pt) discovery — free, no key, SCRAPED. Rather than chase brittle
// CSS selectors, this reads schema.org JSON-LD (LocalBusiness/Organization) embedded in
// the results page — the most stable thing directories expose. Best-effort: returns []
// on any failure. The search URL pattern is the fragile bit and may need upkeep.

import { politeFetch } from "../lib/polite.mjs";

function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { out.push(JSON.parse(m[1].trim())); } catch { /* skip malformed */ }
  }
  return out;
}

function* businesses(node) {
  if (!node) return;
  if (Array.isArray(node)) { for (const n of node) yield* businesses(n); return; }
  if (typeof node !== "object") return;
  if (node["@graph"]) { yield* businesses(node["@graph"]); return; }
  const type = [].concat(node["@type"] ?? []).join(" ");
  if (/LocalBusiness|Organization|Store|Restaurant|Dentist|LegalService|RealEstateAgent/i.test(type)) yield node;
}

export async function discover(scope) {
  const area = scope.area || scope.cities?.[0] || "";
  const verticals = scope.vertical ? [scope.vertical] : scope.verticals ?? ["hospitality"];
  const TERM = {
    restaurants: "restaurantes", cafes: "cafes", bars: "bares", hotels: "hoteis",
    beauty: "cabeleireiros", fitness: "ginasios", dental: "clinicas-dentarias", clinics: "clinicas",
    veterinary: "veterinarios", legal: "advogados", realEstate: "imobiliarias", automotive: "automoveis",
    photography: "fotografia", events: "eventos", trades: "construcao", other: "empresas", hospitality: "hoteis",
  };

  const out = [];
  for (const v of verticals) {
    const url = `https://www.pai.pt/r/${encodeURIComponent(TERM[v] ?? v)}/${encodeURIComponent(area)}`;
    let html;
    try {
      const r = await politeFetch(url, { headers: { accept: "text/html" }, timeout: 20000 });
      if (!r.ok) continue;
      html = await r.text();
    } catch { continue; }
    for (const block of jsonLdBlocks(html)) {
      for (const b of businesses(block)) {
        const name = typeof b.name === "string" ? b.name : null;
        if (!name) continue;
        const site = typeof b.url === "string" && /^https?:/.test(b.url) ? b.url : null;
        const phone = b.telephone || null;
        out.push({
          name,
          vertical: v,
          location: { city: b.address?.addressLocality || area },
          contacts: { website: site, phone },
          hasWebsite: !!site,
          source: "paginas",
          sourceConfidence: 0.5,
        });
      }
    }
  }
  return out;
}
