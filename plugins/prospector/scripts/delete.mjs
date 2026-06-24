// Delete selected companies and everything keyed to them (audit + screenshots + outreach).
// Destructive and intentional — the dashboard confirms before queuing this.

import { deleteCompany, readCompany, storeRoot } from "../lib/store.mjs";
import { emit, progress, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
const ids = req.companyIds ?? [];
const deleted = [];

for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const c = readCompany(id, root);
  if (!c) continue; // already gone
  progress({ i: i + 1, n: ids.length, item: c.name || id, phase: "deleting" });
  deleteCompany(id, root);
  deleted.push(id);
}

emit({ action: "delete", ok: true, deleted, count: deleted.length });
