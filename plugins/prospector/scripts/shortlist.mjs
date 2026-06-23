// shortlist — mark/unmark companies as potential clients (pipeline.shortlisted).
// Orthogonal to status; it's the user's "save this one to dig into later" flag.

import { readCompany, storeRoot, writeCompany } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
const ids = req.companyIds ?? [];
const value = req.payload?.value !== false; // default true; pass {value:false} to unshortlist
const changed = [];

for (const id of ids) {
  const c = readCompany(id, root);
  if (!c) continue;
  c.pipeline = { ...(c.pipeline ?? {}), shortlisted: value };
  writeCompany(c, root);
  changed.push(id);
}

emit({ action: "shortlist", ok: true, value, changed, count: changed.length });
