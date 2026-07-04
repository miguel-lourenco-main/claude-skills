// Write an agent-produced taste grade into an audit, clearing the pending flag.
// The SCORES come from the agent looking at the real screenshots — this script only
// validates + persists them. It never invents scores.
//
//   node scripts/grade.mjs '{"companyId":"pt-x","taste":{"scores":{...},"opportunity":0.8,
//     "datedSignals":[...],"issues":[...],"effortEstimate":"M"}}'

import { readAudit, storeRoot, touchHeartbeat, writeAudit } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
touchHeartbeat(root); // grading = agent present
const req = readRequest();
const id = req.companyId;
const a = readAudit(id, root);
if (!a) { emit({ action: "grade", ok: false, error: `no audit for ${id}` }); process.exit(0); }
if (a.reachable === false) { emit({ action: "grade", ok: false, error: `${id} is unreachable — nothing to grade` }); process.exit(0); }

const t = req.taste ?? {};
// Validate, don't trust: scores clamp to the 1–5 rubric, opportunity to 0–1. A typo'd
// "opportunity":8.6 must not silently rank a lead off the scale.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const scores = {};
for (const [k, v] of Object.entries(t.scores ?? {})) if (typeof v === "number") scores[k] = clamp(v, 1, 5);
const vals = Object.values(scores);
const overall = typeof t.overall === "number"
  ? clamp(t.overall, 1, 5)
  : (vals.length ? Number((vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(1)) : null);

a.taste = {
  scores,
  overall,
  summary: typeof t.summary === "string" ? t.summary.slice(0, 300) : null, // one-line verdict, reusable in outreach/dossiers
  datedSignals: t.datedSignals ?? [],
  issues: t.issues ?? [],
  opportunity: typeof t.opportunity === "number" ? clamp(t.opportunity, 0, 1) : null,
  effortEstimate: ["S", "M", "L"].includes(t.effortEstimate) ? t.effortEstimate : null,
}; // note: no `pending` key → graded

writeAudit(a, root);
emit({ action: "grade", ok: true, companyId: id, overall, opportunity: a.taste.opportunity });
