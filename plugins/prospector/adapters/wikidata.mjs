// Wikidata discovery via SPARQL — free, no key. Companies located in Portugal (P17=Q45)
// with an official website (P856). Skews to larger / notable orgs; complements OSM's
// long tail of small local SMEs. Sometimes carries employees (P1128) / revenue (P2139).

import { politeFetch } from "../lib/polite.mjs";

const SPARQL = "https://query.wikidata.org/sparql";

export async function discover(scope) {
  const limit = Math.min(100, scope.count ?? 60);
  // headquarters-location city label when present; official website required.
  const q = `SELECT ?item ?itemLabel ?website ?employees ?revenue ?cityLabel WHERE {
    ?item wdt:P17 wd:Q45 ; wdt:P856 ?website .
    OPTIONAL { ?item wdt:P1128 ?employees. }
    OPTIONAL { ?item wdt:P2139 ?revenue. }
    OPTIONAL { ?item wdt:P159 ?city. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
  } LIMIT ${limit}`;
  const url = `${SPARQL}?format=json&query=${encodeURIComponent(q)}`;

  let j;
  try {
    const r = await politeFetch(url, { headers: { accept: "application/sparql-results+json" }, timeout: 30000 }, { robots: false });
    if (!r.ok) return [];
    j = await r.json();
  } catch { return []; }

  const out = [];
  for (const b of j.results?.bindings ?? []) {
    const name = b.itemLabel?.value;
    if (!name || /^Q\d+$/.test(name)) continue; // skip unlabeled items
    const site = b.website?.value || null;
    const employees = b.employees ? Math.round(Number(b.employees.value)) : undefined;
    const revenue = b.revenue ? Number(b.revenue.value) : undefined;
    out.push({
      name,
      vertical: scope.vertical || "other",
      location: { city: b.cityLabel?.value && !/^Q\d+$/.test(b.cityLabel.value) ? b.cityLabel.value : null },
      contacts: { website: site, phone: null },
      hasWebsite: !!site,
      source: "wikidata",
      sourceConfidence: 0.6,
      extra: { employees, revenue },
    });
  }
  return out;
}
