// List the deep-dive requests awaiting the agent (queued `deepdive`, not yet resolved),
// expanded per company with the context the agent needs to start researching. Touches the
// heartbeat so the dashboard shows the agent is on it.

import { hasDossier, readAudit, readCompany, readQueue, readResults, storeRoot, touchHeartbeat } from "../lib/store.mjs";
import { emit } from "./_cli.mjs";

const root = storeRoot();
touchHeartbeat(root);
const handled = new Set(readResults(root).map((r) => r.reqId).filter(Boolean));
const items = [];

for (const req of readQueue(root)) {
  if (req.action !== "deepdive" || handled.has(req.id)) continue;
  for (const id of req.companyIds ?? []) {
    const c = readCompany(id, root);
    if (!c) continue;
    const a = readAudit(id, root);
    items.push({
      reqId: req.id,
      companyId: id,
      name: c.name,
      website: c.contacts?.website ?? null,
      vertical: c.sector?.vertical,
      city: c.location?.city,
      district: c.location?.district,
      phones: c.contacts?.phones ?? [],
      social: c.contacts?.social ?? {},
      opportunity: a?.taste?.opportunity ?? null,
      hasDossier: hasDossier(id, root),
    });
  }
}

emit({ action: "deepdive-pending", count: items.length, items });
