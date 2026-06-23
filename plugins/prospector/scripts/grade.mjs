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
const scores = t.scores ?? {};
const vals = Object.values(scores).filter((v) => typeof v === "number");
const overall = typeof t.overall === "number"
  ? t.overall
  : (vals.length ? Number((vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(1)) : null);

a.taste = {
  scores,
  overall,
  datedSignals: t.datedSignals ?? [],
  issues: t.issues ?? [],
  opportunity: typeof t.opportunity === "number" ? t.opportunity : null,
  effortEstimate: t.effortEstimate ?? null,
}; // note: no `pending` key → graded

writeAudit(a, root);
emit({ action: "grade", ok: true, companyId: id, overall, opportunity: a.taste.opportunity });
