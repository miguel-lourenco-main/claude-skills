// Delete selected companies and everything keyed to them (audit + screenshots + outreach).
// Destructive and intentional — the dashboard confirms before queuing this.

import { deleteCompany, readCompany, storeRoot } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
const ids = req.companyIds ?? [];
const deleted = [];

for (const id of ids) {
  if (!readCompany(id, root)) continue; // already gone
  deleteCompany(id, root);
  deleted.push(id);
}

emit({ action: "delete", ok: true, deleted, count: deleted.length });
