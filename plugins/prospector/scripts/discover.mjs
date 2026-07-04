// Real discovery — run the enabled source adapters, merge + dedupe across them, and write
// company dossiers. Revenue is generally unavailable from free sources, so revenueKnown is
// set honestly (scoring then uses a neutral can-pay prior). The agent source is handled by
// the agent (WebSearch/WebFetch), not here.

import { dedupeByUrl, readCompany, readScope, storeRoot, writeCompany } from "../lib/store.mjs";
import { companyId, dedupeKey, domainOf, mergeCompany } from "../lib/identity.mjs";
import { emit, progress, readRequest } from "./_cli.mjs";

const SCRIPT_SOURCES = ["osm", "wikidata", "gmaps", "paginas"];
const root = storeRoot();
const req = readRequest();
const scope = readScope(root);
const p = req.payload ?? {};

// working scope: payload overrides for this run (area/count/sources); vertical is set per-call below.
const ws = { ...scope, area: p.area ?? scope.cities?.[0], district: p.district, count: p.count };

// Verticals: new multi-select (verticals[]) → legacy single (vertical) → scope.verticals → ["other"].
const verticals = (Array.isArray(p.verticals) && p.verticals.length) ? p.verticals
  : p.vertical ? [p.vertical]
  : (scope.verticals?.length ? scope.verticals : ["other"]);
// Website filter: "any" | "has" | "none" (none = get-a-site leads). Default from scope.hasWebsite;
// tolerate the legacy onlyWithWebsite boolean.
const website = p.website ?? (p.onlyWithWebsite === true ? "has"
  : scope.hasWebsite === true ? "has" : scope.hasWebsite === false ? "none" : "any");
const hasSiteOf = (it) => !!(it.hasWebsite || it.contacts?.website);
const passWebsite = (it) => website === "any" || (website === "has" ? hasSiteOf(it) : !hasSiteOf(it));

// Exclude already-known: skip companies already in the store (default on → runs stay additive).
const onlyNew = p.onlyNew !== false;
// Scope filters honored at merge time (only bite when onlyNew is off): don't re-surface contacted or
// recently-discovered leads.
const excludeContacted = scope.excludeContacted !== false;
const freshnessDays = Number(scope.freshnessDays ?? 0);

const denied = new Set(scope.sources?.deny ?? []);
const requested = p.sources ?? scope.sources?.allow ?? ["osm"];
const runSources = requested.filter((s) => SCRIPT_SOURCES.includes(s) && !denied.has(s));
const agentRequested = requested.includes("agent");

// wikidata ignores vertical (queries PT companies with a website); only osm/gmaps/paginas key off it.
const VERTICAL_AWARE = new Set(["osm", "gmaps", "paginas"]);
const perVerticalCount = Math.max(10, Math.ceil((p.count ?? scope.maxCompanies ?? 200) / verticals.length));

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
    discoveredAt: new Date().toISOString(), // full timestamp of store-entry; preserved across re-discovery
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
// Run each source across every requested vertical (wikidata once — it's vertical-agnostic).
const plan = [];
for (const src of runSources) for (const v of (VERTICAL_AWARE.has(src) ? verticals : [verticals[0]])) plan.push({ src, v });
for (let s = 0; s < plan.length; s++) {
  if (stopping) break;
  const { src, v } = plan[s];
  progress({ i: s + 1, n: plan.length, item: src, phase: "querying", message: `${v}${ws.area ? " · " + ws.area : ""}` });
  try {
    const mod = await import(`../adapters/${src}.mjs`);
    const items = await mod.discover({ ...ws, vertical: v, count: perVerticalCount });
    let kept = 0;
    for (const it of items) {
      if (!it?.name) continue;
      it.vertical = it.vertical || v;      // tag with the vertical we queried (adapters may not set it)
      if (!passWebsite(it)) continue;       // any / has-site / no-site (get-a-site)
      partials.push(it);
      kept++;
    }
    progress({ i: s + 1, n: plan.length, item: src, phase: "found", message: `${v}: ${kept}` });
  } catch (e) {
    errors[src] = e.message;
    progress({ i: s + 1, n: plan.length, item: src, phase: "error", message: e.message });
  }
}

// 2) dedupe across sources, 3) merge onto existing, 4) write
const groups = new Map();
for (const pc of partials) {
  const k = dedupeKey(pc);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(pc);
}

const suppressedDomains = new Set(scope.suppress?.domains ?? []);
const suppressedTaxIds = new Set(scope.suppress?.taxIds ?? []);
// target number of companies to ADD this run (the user's "how many"); else the scope cap.
const cap = p.count ?? scope.maxCompanies ?? 200;
const now = Date.now();
const recentlyDiscovered = (c) => freshnessDays > 0 && c?.discoveredAt && (now - new Date(c.discoveredAt).getTime()) < freshnessDays * 86400000;
const bySource = {};
let added = 0, updated = 0, skipped = 0;
const G = groups.size;
let gi = 0;
progress({ phase: "merging", message: `${G} unique of ${partials.length} raw` });

// Interleave groups across verticals (round-robin) so a small cap fills fairly — otherwise the first
// vertical would consume the whole cap and later verticals get skipped.
const byV = new Map();
for (const items of groups.values()) {
  const v = items[0]?.vertical || "other";
  if (!byV.has(v)) byV.set(v, []);
  byV.get(v).push(items);
}
const ordered = [];
for (const buckets = [...byV.values()]; buckets.some((b) => b.length); ) {
  for (const b of buckets) { const x = b.shift(); if (x) ordered.push(x); }
}

for (const items of ordered) {
  if (stopping) break;
  progress({ i: ++gi, n: G, item: items[0]?.name ?? "—", phase: "saving" });
  let merged = toCompany(items[0]);
  for (const it of items.slice(1)) merged = mergeCompany(merged, toCompany(it));
  if (merged.contacts?.domain && suppressedDomains.has(merged.contacts.domain)) { skipped++; continue; }
  if (merged.taxId && suppressedTaxIds.has(merged.taxId)) { skipped++; continue; }
  const existing = readCompany(merged.id, root);
  if (existing) {
    if (onlyNew) { skipped++; continue; }                                                 // exclude already-known
    if (excludeContacted && existing.pipeline?.status === "contacted") { skipped++; continue; }
    if (recentlyDiscovered(existing)) { skipped++; continue; }                             // discovered within freshnessDays
  } else if (added >= cap) { skipped++; continue; }
  let record = merged;
  if (existing) {
    record = mergeCompany(existing, merged);
    // First discovery wins. Keep the original timestamp; never stamp a re-discovery time over it,
    // and don't backfill legacy records (no original time → leave the field off; UI falls back to date).
    if (existing.discoveredAt) record.discoveredAt = existing.discoveredAt; else delete record.discoveredAt;
  }
  writeCompany(record, root);
  if (existing) updated++; else added++;
  for (const it of items) bySource[it.source] = (bySource[it.source] ?? 0) + 1;
}

// Collapse any url-twins now in the store (e.g. a record whose audit resolved to a domain another
// record already owns). Single-process here, so it's race-free. Skip on a canceled (partial) run.
let deduped;
if (!stopping) {
  try {
    const collapses = dedupeByUrl(root);
    if (collapses.length) deduped = collapses.reduce((n, c) => n + c.merged.length, 0);
  } catch { /* dedupe is best-effort cleanup; never fail the discover on it */ }
}

emit({
  action: "discover",
  ok: Object.keys(errors).length === 0 && !stopping,
  added,
  updated,
  skipped,
  deduped,
  canceled: stopping || undefined,
  verticals,
  website,
  onlyNew,
  bySource,
  errors: Object.keys(errors).length ? errors : undefined,
  agentRequested: agentRequested || undefined,
  note: agentRequested ? "source 'agent' requested — run the agent-research adapter (WebSearch/WebFetch) per prospect-discover." : undefined,
});
