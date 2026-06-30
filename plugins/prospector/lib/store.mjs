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
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { domainOf, mergeCompany } from "./identity.mjs";

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
  dossiers: join(root, "dossiers"),
  assessments: join(root, "assessments"),
  requests: join(root, "requests"),
  queue: join(root, "requests", "queue.jsonl"),
  results: join(root, "requests", "results.jsonl"),
  cancel: join(root, "requests", "cancel.jsonl"),
  running: join(root, "requests", "running.json"),
  agentRunning: join(root, "requests", "agent-running.json"),
  logs: join(root, "requests", "logs"),
  heartbeat: join(root, "requests", "agent.heartbeat"),
  imports: join(root, "requests", "imports"),        // uploaded import bundles (temp)
  worker: join(root, "requests", "worker.json"),     // remote-worker presence map (Part B)
  leases: join(root, "requests", "leases.jsonl"),    // append-only agent-request lease log (Part B)
  leads: join(root, "leads.md"),
});

/** The store entries that make up an export/sync bundle (only those that exist), relative to `root`.
 *  Full (with screenshots) for export + the worker push; JSON-only (`{screenshots:false}`) for the
 *  worker pull — the agent never needs the screenshots as input, and they are 95% of the bytes. */
export function bundleDirs(root = storeRoot(), { screenshots = true } = {}) {
  const names = ["scope.json", "leads.md", "companies", "audits", "assessments", "dossiers", "outreach"];
  if (screenshots) names.push("screenshots");
  return names.filter((n) => existsSync(join(root, n)));
}

/** A live Claude session marks itself present (grading/researching) by touching this. */
export function touchHeartbeat(root = storeRoot()) {
  try { writeJSON(paths(root).heartbeat, { at: Date.now() }); } catch { /* ignore */ }
}
/** Is an agent "online"? True if the heartbeat was touched in the last ~90s. */
export function agentOnline(root = storeRoot()) {
  const hb = readJSON(paths(root).heartbeat);
  return !!(hb?.at && Date.now() - hb.at < 90_000);
}

/** Delete a company and everything keyed to it (audit + screenshots). Destructive. */
export function deleteCompany(id, root = storeRoot()) {
  const p = paths(root);
  for (const f of [companyFile(id, root), auditFile(id, root), join(p.outreach, `${id}.md`), outreachFile(id, root), dossierFile(id, root)]) {
    try { rmSync(f); } catch { /* not present */ }
  }
  try { rmSync(join(p.screenshots, id), { recursive: true, force: true }); } catch { /* none */ }
}

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
  for (const d of [p.root, p.companies, p.audits, p.screenshots, p.outreach, p.dossiers, p.assessments, p.requests, p.logs]) {
    mkdirSync(d, { recursive: true });
  }
  // Seed sample data ONLY into a truly empty store. A real, discovered store (which has
  // companies but may not have written a scope.json yet) must NEVER get sample data mixed in.
  if (listCompanyIds(root).length === 0) seedFromSample(root);
  else if (!existsSync(p.scope)) writeJSON(p.scope, defaultScope());
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

export const dossierFile = (id, root = storeRoot()) => join(paths(root).dossiers, `${id}.md`);
export const hasDossier = (id, root = storeRoot()) => existsSync(dossierFile(id, root));
export const readDossier = (id, root = storeRoot()) => { try { return readFileSync(dossierFile(id, root), "utf8"); } catch { return null; } };

// Hunt assessment (the qualify verdict + pitch), keyed by company id.
export const assessmentFile = (id, root = storeRoot()) => join(paths(root).assessments, `${id}.json`);
export const hasAssessment = (id, root = storeRoot()) => existsSync(assessmentFile(id, root));
export const readAssessment = (id, root = storeRoot()) => readJSON(assessmentFile(id, root));
export const writeAssessment = (a, root = storeRoot()) => writeJSON(assessmentFile(a.companyId, root), a);

// Outreach package (email + text + researched contacts + send state), keyed by company id.
export const outreachFile = (id, root = storeRoot()) => join(paths(root).outreach, `${id}.json`);
export const hasOutreach = (id, root = storeRoot()) => existsSync(outreachFile(id, root));
export const readOutreach = (id, root = storeRoot()) => readJSON(outreachFile(id, root));
export const writeOutreach = (o, root = storeRoot()) => writeJSON(outreachFile(o.companyId, root), o);

export const auditFile = (id, root = storeRoot()) =>
  join(paths(root).audits, `${id}.website.json`);
export const hasAudit = (id, root = storeRoot()) => existsSync(auditFile(id, root));
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
  const companies = listCompanies(root).map((c) => ({ ...c, audit: readAudit(c.id, root), hasDossier: hasDossier(c.id, root), assessment: readAssessment(c.id, root), outreach: readOutreach(c.id, root) }));
  companies.sort((a, b) => (b.audit?.taste?.opportunity ?? -1) - (a.audit?.taste?.opportunity ?? -1));
  const graded = (a) => a?.taste && !a.taste.pending && typeof a.taste.overall === "number";
  // queued agent requests still awaiting the agent (queue ids without a result).
  const handled = new Set(readResults(root).map((r) => r.reqId).filter(Boolean));
  const pendingByAction = (act) => readQueue(root).filter((r) => r.action === act && !handled.has(r.id)).length;
  const pendingDeepdive = readQueue(root).filter((r) => r.action === "deepdive" && !handled.has(r.id))
    .flatMap((r) => r.companyIds ?? []).filter((id, i, a) => a.indexOf(id) === i).length;
  const stats = {
    total: companies.length,
    captured: companies.filter((c) => c.audit?.reachable).length,
    graded: companies.filter((c) => graded(c.audit)).length,
    highOpportunity: companies.filter((c) => graded(c.audit) && c.audit.taste.opportunity >= 0.7).length,
    shortlisted: companies.filter((c) => c.pipeline?.shortlisted).length,
    dossiers: companies.filter((c) => c.hasDossier).length,
    qualified: companies.filter((c) => c.pipeline?.hunt?.status === "qualified").length,
    rejected: companies.filter((c) => c.pipeline?.hunt?.status === "rejected").length,
    contacted: companies.filter((c) => c.pipeline?.status === "contacted").length,
    noWebsite: companies.filter((c) => !c.digital?.hasWebsite).length,
    // outreach pipeline (one outreach record per company)
    outreachDrafts: companies.filter((c) => c.outreach?.status === "draft").length,
    outreachReady: companies.filter((c) => c.outreach && ["validated", "bundled"].includes(c.outreach.status)).length,
    bundled: companies.filter((c) => c.outreach?.status === "bundled").length,
    outreachSent: companies.filter((c) => c.outreach?.status === "sent").length,
    // agent-needed work + presence.
    pendingGrading: companies.filter((c) => c.audit?.reachable && c.audit?.taste?.pending).length,
    pendingDeepdive,
    pendingHunt: pendingByAction("hunt"), // queued hunt requests awaiting the agent
    agentOnline: agentOnline(root),
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

/** Record a cancellation: a specific reqId, or {all:true} to cancel everything queued up to now. */
export function cancelRequest({ reqId, all } = {}, root = storeRoot()) {
  ensureStore(root);
  appendFileSync(paths(root).cancel, JSON.stringify({ reqId, all: !!all, at: Date.now() }) + "\n", "utf8");
}
/** → { ids:Set<reqId>, allBefore:number } — a request is canceled if its id is in ids,
 *  or it was queued at/before allBefore (an "cancel all" cutoff). */
export function readCancels(root = storeRoot()) {
  const ids = new Set();
  let allBefore = 0;
  for (const c of readJsonl(paths(root).cancel)) {
    if (c.reqId) ids.add(c.reqId);
    if (c.all && c.at) allBefore = Math.max(allBefore, c.at);
  }
  return { ids, allBefore };
}

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

// ---- remote-worker presence + agent-request leases (Part B) -----------------
// The agent actions a remote worker (a local Claude session) can drain off the user's subscription.
export const AGENT_ACTIONS = new Set(["deepdive", "hunt", "outreach"]);
// Timing knobs (one source of truth, shared by the bridge + agent-runner):
export const WORKER_PRESENCE_MS = 60_000;    // a worker counts as "connected" if it heartbeat within this
export const LEASE_TTL_MS = 5 * 60_000;      // a lease is live until expiresAt; the worker renews via heartbeat
export const RECLAIM_GRACE_MS = 2 * 60_000;  // the cloud waits this long past expiry before reclaiming
export const WORKER_DIBS_MS = 30_000;        // a present worker gets first dibs on a fresh request for this long

export const readWorker = (root = storeRoot()) => readJSON(paths(root).worker, { workers: {} });
export const writeWorker = (map, root = storeRoot()) => writeJSON(paths(root).worker, map);
/** Record/refresh one worker's presence (heartbeat). Returns the worker entry. */
export function touchWorker(workerId, info = {}, root = storeRoot()) {
  const m = readWorker(root); m.workers = m.workers ?? {};
  m.workers[workerId] = { at: Date.now(), claudeAvailable: info.claudeAvailable !== false, leases: info.leases ?? [] };
  writeWorker(m, root);
  return m.workers[workerId];
}
/** At least one remote worker connected AND able to run claude (so the cloud should defer to it). */
export function workerPresent(root = storeRoot()) {
  const m = readWorker(root);
  return Object.values(m.workers ?? {}).some((w) => w?.at && Date.now() - w.at < WORKER_PRESENCE_MS && w.claudeAvailable);
}
/** Append-only lease log entry: {type:'lease'|'renew'|'release', reqId, workerId, expiresAt}. */
export function appendLease(entry, root = storeRoot()) {
  mkdirSync(paths(root).requests, { recursive: true });
  appendFileSync(paths(root).leases, JSON.stringify({ at: Date.now(), ...entry }) + "\n", "utf8");
}
/** Fold leases.jsonl to the latest entry per reqId. */
export function leaseState(root = storeRoot()) {
  const m = new Map();
  for (const e of readJsonl(paths(root).leases)) if (e.reqId) m.set(e.reqId, e);
  return m;
}
/** Is this lease entry currently held (not released, not expired)? */
export const leaseLive = (e) => !!e && e.type !== "release" && (e.expiresAt ?? 0) > Date.now();

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

/** Does this company have a trustworthy revenue figure? Unknown ≠ zero. */
export function revenueKnown(company) {
  const rev = company.size?.revenue?.value;
  return company.size?.revenueKnown !== false && typeof rev === "number" && rev > 0;
}

/** Ranking signal: the redesign opportunity (0..1) from a graded audit, with honest priors
 *  for not-yet-graded states. This is what the dashboard ranks by (no composite "score"). */
export function opportunityOf(company, audit) {
  if (audit?.taste && typeof audit.taste.opportunity === "number") return audit.taste.opportunity;
  if (audit && audit.reachable === false) return audit.reason === "no website" ? 0.7 : 0.6;
  if (audit?.taste?.pending) return 0.5;            // captured, awaiting grading
  return company?.digital?.hasWebsite ? 0.4 : 0.6;  // not audited
}

/** Canonical URL identity for a company: prefer the audit's redirect-RESOLVED url host (audit.url
 *  is the finalUrl for a reachable site), else the discovered website domain. Two companies sharing
 *  this key are the same site reached two ways (e.g. geocasa.com.pt → geocasa.pt). Null when no URL
 *  is known — a company with no website is never a URL duplicate of another. */
export function urlKey(company, audit) {
  const host = domainOf(audit?.url) || company?.contacts?.domain || domainOf(company?.contacts?.website);
  return host ? `d:${host}` : null;
}

/** Redirect-deduplication: collapse companies that resolve to the SAME url into one entry.
 *  Groups every company by its canonical url key; for any group >1, keeps a single survivor and
 *  merges + deletes the rest. Survivor preference: reachable audit > has audit > more provenance
 *  (so the kept id/audit/screenshots are the canonical destination's). The shortlisted flag is
 *  OR-ed across the group so a flag on a soon-to-be-deleted twin isn't lost. Idempotent: a store
 *  with no url-twins is left untouched. Returns the collapses performed (for reporting). */
export function dedupeByUrl(root = storeRoot()) {
  const entries = listCompanies(root).map((c) => ({ c, a: readAudit(c.id, root) }));
  const groups = new Map();
  for (const e of entries) {
    const k = urlKey(e.c, e.a);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const score = ({ c, a }) =>
    (a?.reachable === true ? 4 : 0) +
    (a ? 2 : 0) +
    Math.min(1, (c.provenance?.length ?? 0) / 10) +
    (c.pipeline?.hunt?.status === "qualified" ? 0.5 : 0);
  const collapses = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    members.sort((x, y) => score(y) - score(x));
    const survivor = members[0];
    const losers = members.slice(1);
    let merged = survivor.c;
    for (const l of losers) merged = mergeCompany(merged, l.c); // survivor wins scalars; unions contacts/provenance
    merged.id = survivor.c.id;                                  // keep survivor id → its audit + screenshots stay valid
    merged.pipeline = { ...merged.pipeline, shortlisted: members.some((m) => m.c.pipeline?.shortlisted) };
    writeCompany(merged, root);
    for (const l of losers) deleteCompany(l.c.id, root);        // removes the twin + its audit/screenshots/dossier
    collapses.push({ key, survivor: survivor.c.id, merged: losers.map((l) => l.c.id) });
  }
  return collapses;
}
