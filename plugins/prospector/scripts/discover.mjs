// Real discovery — run the enabled source adapters, merge + dedupe across them, and write
// company dossiers. Revenue is generally unavailable from free sources, so revenueKnown is
// set honestly (scoring then uses a neutral can-pay prior). The agent source is handled by
// the agent (WebSearch/WebFetch), not here.

import { readCompany, readScope, storeRoot, writeCompany } from "../lib/store.mjs";
import { companyId, dedupeKey, domainOf, mergeCompany } from "../lib/identity.mjs";
import { emit, readRequest } from "./_cli.mjs";

const SCRIPT_SOURCES = ["osm", "wikidata", "gmaps", "paginas"];
const root = storeRoot();
const req = readRequest();
const scope = readScope(root);
const p = req.payload ?? {};

// working scope: payload overrides for this run (area/vertical/count/sources)
const ws = { ...scope, area: p.area ?? scope.cities?.[0], district: p.district, vertical: p.vertical, count: p.count };
const onlyWithWebsite = !!p.onlyWithWebsite;
const requested = p.sources ?? scope.sources?.allow ?? ["osm"];
const runSources = requested.filter((s) => SCRIPT_SOURCES.includes(s));
const agentRequested = requested.includes("agent");

const today = () => new Date().toISOString().slice(0, 10);

function toCompany(pc) {
  const website = pc.contacts?.website ?? pc.website ?? null;
  const vertical = pc.vertical || "other";
  const size = pc.extra?.revenue
    ? { revenue: { value: pc.extra.revenue, currency: "EUR" }, revenueKnown: true }
    : { revenueKnown: false };
  if (pc.extra?.employees) size.employees = pc.extra.employees;
  return {
    id: companyId(pc),
    name: pc.name,
    taxId: null,
    sector: { cae: [], labels: [vertical], vertical },
    description: `Discovered ${vertical}${pc.location?.city ? ` in ${pc.location.city}` : ""} via ${pc.source}.`,
    location: { country: "PT", district: pc.location?.district ?? null, city: pc.location?.city ?? null, lat: pc.location?.lat, lng: pc.location?.lng },
    size,
    contacts: {
      website,
      domain: domainOf(website),
      emails: pc.contacts?.emails ?? (pc.contacts?.email ? [pc.contacts.email] : []),
      phones: pc.contacts?.phones ?? (pc.contacts?.phone ? [pc.contacts.phone] : []),
      social: pc.contacts?.social ?? {},
    },
    digital: { hasWebsite: !!website, socialOnly: !website },
    provenance: [{ source: pc.source, fetchedAt: today(), fields: ["name", "location", website ? "website" : "hasWebsite"], confidence: pc.sourceConfidence ?? 0.6 }],
    pipeline: { status: "candidate", leadScore: null },
    schemaVersion: 1,
  };
}

// 1) run adapters
const partials = [];
// Cooperative cancel: stop between sources, keeping whatever was already gathered/written.
let stopping = false;
const onStop = () => { stopping = true; };
process.on("SIGTERM", onStop);
process.on("SIGINT", onStop);

const errors = {};
for (const src of runSources) {
  if (stopping) break;
  try {
    const mod = await import(`../adapters/${src}.mjs`);
    const items = await mod.discover(ws);
    for (const it of items) {
      if (!it?.name) continue;
      if (onlyWithWebsite && !(it.hasWebsite || it.contacts?.website)) continue; // target improvable sites
      partials.push(it);
    }
  } catch (e) {
    errors[src] = e.message;
  }
}

// 2) dedupe across sources, 3) merge onto existing, 4) write
const groups = new Map();
for (const pc of partials) {
  const k = dedupeKey(pc);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(pc);
}

const suppressed = new Set(scope.suppress?.domains ?? []);
// target number of companies to ADD this run (the user's "how many"); else the scope cap.
const cap = p.count ?? scope.maxCompanies ?? 200;
const bySource = {};
let added = 0, updated = 0, skipped = 0;

for (const items of groups.values()) {
  if (stopping) break;
  let merged = toCompany(items[0]);
  for (const it of items.slice(1)) merged = mergeCompany(merged, toCompany(it));
  if (merged.contacts?.domain && suppressed.has(merged.contacts.domain)) { skipped++; continue; }
  const existing = readCompany(merged.id, root);
  if (!existing && added >= cap) { skipped++; continue; }
  writeCompany(existing ? mergeCompany(existing, merged) : merged, root);
  if (existing) updated++; else added++;
  for (const it of items) bySource[it.source] = (bySource[it.source] ?? 0) + 1;
}

emit({
  action: "discover",
  ok: Object.keys(errors).length === 0 && !stopping,
  added,
  updated,
  skipped,
  canceled: stopping || undefined,
  bySource,
  errors: Object.keys(errors).length ? errors : undefined,
  agentRequested: agentRequested || undefined,
  note: agentRequested ? "source 'agent' requested — run the agent-research adapter (WebSearch/WebFetch) per prospect-discover." : undefined,
});
