// setstatus — manual pipeline transitions from the board (drag-to-advance / "move" menu / the
// panel's next-step button). Sets any of: pipeline.status (candidate|outreach-ready|contacted),
// pipeline.shortlisted (bool), or a MANUAL hunt verdict (pipeline.hunt.status qualified|rejected,
// stamped manual:true so it's distinguishable from an agent verdict). Agent-driven transitions
// (audit/grade/qualify-via-hunt/deepdive/outreach-draft) keep going through their own actions; this
// only persists the moves a human makes by hand — including marking a lead "contacted", which had
// no setter before.

import { readCompany, storeRoot, writeCompany } from "../lib/store.mjs";
import { emit, progress, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
const ids = req.companyIds ?? [];
const p = req.payload ?? {};
const changed = [];

for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const c = readCompany(id, root);
  if (!c) continue;
  progress({ i: i + 1, n: ids.length, item: c.name || id, phase: "moving" });
  c.pipeline = { ...(c.pipeline ?? {}) };
  if (p.status !== undefined) c.pipeline.status = p.status;
  if (p.shortlisted !== undefined) c.pipeline.shortlisted = !!p.shortlisted;
  if (p.huntStatus !== undefined) c.pipeline.hunt = { ...(c.pipeline.hunt ?? {}), status: p.huntStatus, manual: true };
  writeCompany(c, root);
  changed.push(id);
}

emit({ action: "setstatus", ok: true, changed, count: changed.length, set: { status: p.status, shortlisted: p.shortlisted, huntStatus: p.huntStatus } });
