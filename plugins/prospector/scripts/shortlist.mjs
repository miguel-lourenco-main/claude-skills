// shortlist — mark/unmark companies as potential clients (pipeline.shortlisted).
// Orthogonal to status; it's the user's "save this one to dig into later" flag.

import { readCompany, storeRoot, writeCompany } from "../lib/store.mjs";
import { emit, progress, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
const ids = req.companyIds ?? [];
const value = req.payload?.value !== false; // default true; pass {value:false} to unshortlist
const changed = [];

for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const c = readCompany(id, root);
  if (!c) continue;
  progress({ i: i + 1, n: ids.length, item: c.name || id, phase: value ? "shortlisting" : "unshortlisting" });
  c.pipeline = { ...(c.pipeline ?? {}), shortlisted: value };
  writeCompany(c, root);
  changed.push(id);
}

emit({ action: "shortlist", ok: true, value, changed, count: changed.length });
