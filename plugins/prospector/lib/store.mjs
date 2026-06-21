// Prospector store library — the filesystem IS the database.
// Shared by the bridge (read/serve) and the action scripts (mutate). Zero deps.
//
// Layout under the store root (PROSPECTOR_ROOT, default $PWD/.prospector):
//   scope.json · companies/<id>.json · audits/<id>.website.json
//   screenshots/<id>/* · requests/queue.jsonl · requests/results.jsonl · leads.md

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** The prospector plugin root (…/plugins/prospector), where sample-store lives. */
export const PLUGIN_ROOT = resolve(HERE, "..");

/** Resolve the active store root: $PROSPECTOR_ROOT or ./.prospector under cwd. */
export function storeRoot() {
  return resolve(process.env.PROSPECTOR_ROOT ?? join(process.cwd(), ".prospector"));
}

export const paths = (root = storeRoot()) => ({
  root,
  scope: join(root, "scope.json"),
  companies: join(root, "companies"),
  audits: join(root, "audits"),
  screenshots: join(root, "screenshots"),
  outreach: join(root, "outreach"),
  requests: join(root, "requests"),
  queue: join(root, "requests", "queue.jsonl"),
  results: join(root, "requests", "results.jsonl"),
  leads: join(root, "leads.md"),
});

export function readJSON(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJSON(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Create the dir skeleton, and seed from sample-store/seed.json if there are no companies yet. */
export function ensureStore(root = storeRoot()) {
  const p = paths(root);
  for (const d of [p.root, p.companies, p.audits, p.screenshots, p.outreach, p.requests]) {
    mkdirSync(d, { recursive: true });
  }
  if (!existsSync(p.scope) || listCompanyIds(root).length === 0) {
    seedFromSample(root);
  }
  return root;
}

/** Expand the bundled sample-store/seed.json into the per-file store layout. */
export function seedFromSample(root = storeRoot()) {
  const seed = readJSON(join(PLUGIN_ROOT, "sample-store", "seed.json"));
  if (!seed) return false;
  const p = paths(root);
  if (seed.scope) writeJSON(p.scope, seed.scope);
  for (const c of seed.companies ?? []) writeJSON(join(p.companies, `${c.id}.json`), c);
  for (const a of seed.audits ?? []) writeJSON(join(p.audits, `${a.companyId}.website.json`), a);
  return true;
}

export function listCompanyIds(root = storeRoot()) {
  const dir = paths(root).companies;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export const readScope = (root = storeRoot()) => readJSON(paths(root).scope, defaultScope());
export const writeScope = (scope, root = storeRoot()) => writeJSON(paths(root).scope, scope);

export const companyFile = (id, root = storeRoot()) => join(paths(root).companies, `${id}.json`);
export const readCompany = (id, root = storeRoot()) => readJSON(companyFile(id, root));
export const writeCompany = (c, root = storeRoot()) => writeJSON(companyFile(c.id, root), c);

export const auditFile = (id, root = storeRoot()) =>
  join(paths(root).audits, `${id}.website.json`);
export const readAudit = (id, root = storeRoot()) => readJSON(auditFile(id, root));
export const writeAudit = (a, root = storeRoot()) => writeJSON(auditFile(a.companyId, root), a);

export function listCompanies(root = storeRoot()) {
  return listCompanyIds(root)
    .map((id) => readCompany(id, root))
    .filter(Boolean);
}

/** The single aggregated payload the dashboard renders: scope + companies (with their audit) + stats. */
export function aggregateStore(root = storeRoot()) {
  ensureStore(root);
  const scope = readScope(root);
  const companies = listCompanies(root).map((c) => ({ ...c, audit: readAudit(c.id, root) }));
  companies.sort((a, b) => (b.pipeline?.leadScore ?? -1) - (a.pipeline?.leadScore ?? -1));
  const stats = {
    total: companies.length,
    audited: companies.filter((c) => c.audit).length,
    highOpportunity: companies.filter((c) => (c.audit?.taste?.opportunity ?? 0) >= 0.7).length,
    contacted: companies.filter((c) => c.pipeline?.status === "contacted").length,
    noWebsite: companies.filter((c) => !c.digital?.hasWebsite).length,
  };
  return { scope, companies, stats, root, generatedAt: new Date().toISOString() };
}

// ---- request queue ---------------------------------------------------------
/** Append an action request to the queue. Returns the stamped request. */
export function enqueue(action, root = storeRoot()) {
  ensureStore(root);
  const req = {
    id: `req-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    status: "pending",
    queuedAt: new Date().toISOString(),
    ...action,
  };
  appendFileSync(paths(root).queue, JSON.stringify(req) + "\n", "utf8");
  return req;
}

export function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export const readQueue = (root = storeRoot()) => readJsonl(paths(root).queue);
export const readResults = (root = storeRoot()) => readJsonl(paths(root).results);

/** Rewrite the queue (used by the loop to mark requests done). */
export function writeQueue(reqs, root = storeRoot()) {
  const p = paths(root);
  mkdirSync(p.requests, { recursive: true });
  writeFileSync(p.queue, reqs.map((r) => JSON.stringify(r)).join("\n") + (reqs.length ? "\n" : ""), "utf8");
}

export function appendResult(result, root = storeRoot()) {
  ensureStore(root);
  appendFileSync(
    paths(root).results,
    JSON.stringify({ at: new Date().toISOString(), ...result }) + "\n",
    "utf8",
  );
}

// ---- scoring (shared so the dashboard and score.mjs agree) -----------------
export const VERTICAL_WEIGHT = {
  hospitality: 1.0, // storefront — website drives bookings
  realEstate: 0.85,
  clinics: 0.8,
  legal: 0.7,
  trades: 0.55,
  other: 0.5,
};

export function defaultScope() {
  return {
    country: "PT",
    verticals: ["hospitality", "clinics", "legal", "realEstate"],
    revenue: { min: 250000, max: 10000000, currency: "EUR" },
    employees: { min: 5, max: 100 },
    companyAge: { min: 3 },
    hasWebsite: "any",
    maxCompanies: 200,
    freshnessDays: 30,
    excludeContacted: true,
    suppress: { domains: [], taxIds: [] },
    weights: { canPay: 0.35, siteMatters: 0.25, opportunity: 0.4 },
  };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** 0..100 lead score = weighted blend of can-pay, site-matters, and redesign opportunity. */
export function leadScore(company, audit, scope = defaultScope()) {
  const w = scope.weights ?? defaultScope().weights;
  const rev = company.size?.revenue?.value ?? 0;
  const lo = scope.revenue?.min ?? 250000;
  const hi = scope.revenue?.max ?? 10000000;
  let canPay = clamp01((rev - lo) / Math.max(1, hi - lo));
  if ((company.size?.netIncome ?? 0) <= 0) canPay *= 0.6; // unprofitable → discount ability to pay
  const siteMatters = VERTICAL_WEIGHT[company.sector?.vertical] ?? VERTICAL_WEIGHT.other;
  const opportunity = audit?.taste?.opportunity ?? (company.digital?.hasWebsite ? 0.4 : 0.6);
  const score = w.canPay * canPay + w.siteMatters * siteMatters + w.opportunity * opportunity;
  return Math.round(clamp01(score) * 100);
}
