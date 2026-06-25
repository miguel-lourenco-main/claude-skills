// Real audit orchestration — reachability gate → real tech signals → real screenshots.
// It NEVER fabricates taste: a captured site is written with taste:{pending:true} for the
// agent to grade; a no-website or unreachable site gets reachable:false and taste:null.

import { join } from "node:path";
import { dedupeByUrl, listCompanyIds, paths, readCompany, storeRoot, writeAudit } from "../lib/store.mjs";
import { probe } from "../lib/probe.mjs";
import { capture } from "../lib/capture.mjs";
import { emit, progress, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
// A full pass (no explicit ids) runs as ONE process — safe to collapse url-twins afterwards. A
// targeted run (e.g. a hunt's per-company subagents) may be one of MANY concurrent audit processes;
// a store-wide merge+delete there could race a sibling, so targeted runs skip dedupe (discover does it).
const fullPass = !(req.companyIds && req.companyIds.length);
const ids = (fullPass ? listCompanyIds(root) : req.companyIds).filter((id) => readCompany(id, root));

const today = () => new Date().toISOString().slice(0, 10);
const audited = [];       // captured, taste pending
const unreachable = [];   // no site / dead
let captureError = null;

// Cooperative cancel: on a stop signal, finish-safe between companies (all completed
// audits are already on disk) and abort the in-flight capture, then emit a partial result.
const ac = new AbortController();
let stopping = false;
const stop = () => { stopping = true; ac.abort(); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

const N = ids.length;
for (let idx = 0; idx < ids.length; idx++) {
  if (stopping) break;
  const id = ids[idx];
  const c = readCompany(id, root);
  const url = c.contacts?.website;
  const item = c.name || url || id;
  const at = { i: idx + 1, n: N, item };

  // 1) no website → honest record, no capture, no taste
  if (!c.digital?.hasWebsite || !url) {
    progress({ ...at, phase: "no website" });
    writeAudit({ companyId: id, url: null, capturedAt: today(), reachable: false, reason: "no website", tech: null, screenshots: { desktop: [], mobile: [], thumbnail: null }, taste: null }, root);
    unreachable.push(id);
    continue;
  }

  // 2) probe (reachability gate + real tech)
  progress({ ...at, phase: "probing" });
  const p = await probe(url);
  if (!p.reachable) {
    progress({ ...at, phase: "unreachable", message: p.reason ?? "unreachable" });
    writeAudit({ companyId: id, url, capturedAt: today(), reachable: false, reason: p.reason ?? "unreachable", status: p.status ?? null, tech: null, screenshots: { desktop: [], mobile: [], thumbnail: null }, taste: null }, root);
    unreachable.push(id);
    continue;
  }

  // 3) capture real screenshots
  const dir = join(paths(root).screenshots, id);
  let shots = { desktop: [], mobile: [], thumbnail: null, meta: {} };
  let capErr = null;
  try {
    progress({ ...at, phase: "capturing" });
    shots = await capture(p.finalUrl ?? url, dir, { signal: ac.signal, onProgress: (m) => progress({ ...at, phase: "capturing", message: m }) });
  } catch (e) {
    capErr = e.message;
    captureError = captureError ?? e.message;
  }
  if (stopping) break; // aborted mid-capture → skip writing a partial record for this one

  // 4) write audit — taste PENDING (agent grades it), or null if capture failed (nothing to grade)
  const tech = { ...p.tech };
  if (shots.meta?.loadMs != null) tech.loadMs = shots.meta.loadMs;
  writeAudit({
    companyId: id,
    url: p.finalUrl ?? url,
    capturedAt: today(),
    reachable: true,
    status: p.status,
    tech,
    screenshots: { desktop: shots.desktop, mobile: shots.mobile, thumbnail: shots.thumbnail },
    captureError: capErr,
    taste: capErr || !shots.desktop.length ? null : { pending: true },
  }, root);
  progress({ ...at, phase: capErr ? "capture failed" : "captured", message: capErr || `${shots.desktop.length} tiles` });
  audited.push(id);
}

// Now that audits have resolved each site's final (post-redirect) URL, collapse any companies
// that turned out to be the same site reached two ways. Full pass only (see fullPass note above),
// and not on a canceled (partial) run.
let deduped;
if (fullPass && !stopping) {
  try {
    const collapses = dedupeByUrl(root);
    if (collapses.length) {
      deduped = collapses.reduce((n, c) => n + c.merged.length, 0);
      progress({ phase: "deduped", message: `merged ${deduped} url-duplicate${deduped === 1 ? "" : "s"}` });
    }
  } catch (e) {
    progress({ phase: "dedupe error", message: e.message });
  }
}

emit({
  action: "audit",
  ok: !captureError && !stopping,
  audited,
  unreachable,
  pending: audited.length,
  count: audited.length + unreachable.length,
  total: ids.length,
  deduped,
  canceled: stopping || undefined,
  captureError,
});
