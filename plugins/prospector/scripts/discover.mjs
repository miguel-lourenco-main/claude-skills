// STUB discover — appends synthetic companies that match the active scope.
// Next phase: replace the body with real source adapters (Google Maps, Racius, …);
// keep the contract — read scope, write company dossiers, return the added ids.

import { listCompanyIds, readScope, storeRoot, writeCompany } from "../lib/store.mjs";
import { emit, hashInt, pick, readRequest } from "./_cli.mjs";

const NAMES = {
  hospitality: ["Casa", "Quinta", "Hotel", "Estalagem", "Adega", "Solar"],
  clinics: ["Clínica", "Centro Médico", "Consultório"],
  legal: ["Sociedade de Advogados", "Escritório Jurídico"],
  realEstate: ["Imobiliária", "Mediação", "Predial"],
  trades: ["Construções", "Instalações", "Oficina"],
  other: ["Empresa", "Serviços"],
};
const SUFFIX = ["do Vale", "Atlântico", "Central", "do Norte", "Real", "Moderna", "& Filhos", "Premium"];
const CITIES = [
  { city: "Porto", district: "Porto", lat: 41.15, lng: -8.61 },
  { city: "Braga", district: "Braga", lat: 41.55, lng: -8.43 },
  { city: "Coimbra", district: "Coimbra", lat: 40.21, lng: -8.43 },
  { city: "Faro", district: "Faro", lat: 37.02, lng: -7.93 },
  { city: "Évora", district: "Évora", lat: 38.57, lng: -7.91 },
  { city: "Guimarães", district: "Braga", lat: 41.44, lng: -8.29 },
];
const CAE = { hospitality: "55119", clinics: "86230", legal: "69101", realEstate: "68311", trades: "41200", other: "70220" };

const root = storeRoot();
const req = readRequest();
const scope = readScope(root);
const count = Math.max(1, Math.min(10, req.payload?.count ?? 3));
const verticals = req.payload?.vertical ? [req.payload.vertical] : scope.verticals ?? ["hospitality"];

const existing = new Set(listCompanyIds(root));
const lo = scope.revenue?.min ?? 250000;
const hi = scope.revenue?.max ?? 10000000;
const added = [];

for (let i = 0; i < count; i++) {
  const vertical = verticals[i % verticals.length];
  const seed = `disc-${Date.now()}-${i}`;
  const h = hashInt(seed);
  const taxId = `5${String(10000000 + (h % 89999999)).slice(0, 8)}`;
  const id = `pt-${taxId}`;
  if (existing.has(id)) continue;
  existing.add(id);
  const name = `${pick(NAMES[vertical] ?? NAMES.other, seed + "n")} ${pick(SUFFIX, seed + "s")}, Lda`;
  const loc = pick(CITIES, seed + "c");
  const revenue = lo + (h % Math.max(1, hi - lo));
  const hasWebsite = h % 5 !== 0; // ~20% social-only
  const domain = name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 16) + ".pt";
  const company = {
    id,
    name,
    taxId,
    sector: { cae: [CAE[vertical] ?? CAE.other], labels: [vertical], vertical },
    description: `Discovered ${vertical} business in ${loc.city} (stub source).`,
    location: { district: loc.district, city: loc.city, lat: loc.lat, lng: loc.lng },
    size: {
      employees: (scope.employees?.min ?? 5) + (h % 60),
      revenue: { value: revenue, currency: "EUR", year: 2024 },
      netIncome: Math.round(revenue * 0.06),
    },
    founded: 1990 + (h % 33),
    contacts: {
      website: hasWebsite ? `https://${domain}` : null,
      domain: hasWebsite ? domain : null,
      emails: [],
      phones: [`+351 2${String(10000000 + (h % 89999999)).slice(0, 8)}`],
      social: {},
    },
    digital: { hasWebsite, socialOnly: !hasWebsite },
    provenance: [{ source: "stub-discover", fetchedAt: new Date().toISOString().slice(0, 10), fields: ["name", "location", "vertical"], confidence: 0.6 }],
    pipeline: { status: "candidate", leadScore: null },
    schemaVersion: 1,
  };
  writeCompany(company, root);
  added.push(id);
}

emit({ action: "discover", ok: true, added, count: added.length, verticals });
