// List the blueprint requests awaiting the agent (queued `blueprint`, not yet resolved),
// expanded per company with the context the agent needs. Agent-only work: the watch-loop
// skips `blueprint`; a Claude session (or the agent-runner) drains it via prospect-blueprint.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { hasDossier, paths, readAudit, readCompany, readQueue, readResults, storeRoot, touchHeartbeat } from "../lib/store.mjs";
import { emit } from "./_cli.mjs";

const root = storeRoot();
touchHeartbeat(root);
const handled = new Set(readResults(root).map((r) => r.reqId).filter(Boolean));
const items = [];

for (const req of readQueue(root)) {
  if (req.action !== "blueprint" || handled.has(req.id)) continue;
  for (const id of req.companyIds ?? []) {
    const c = readCompany(id, root);
    if (!c) continue;
    const a = readAudit(id, root);
    const dir = join(paths(root).blueprints, id);
    items.push({
      reqId: req.id,
      companyId: id,
      name: c.name,
      website: c.contacts?.website ?? null,
      vertical: c.sector?.vertical,
      city: c.location?.city,
      auditGraded: !!(a?.taste && !a.taste.pending),
      opportunity: a?.taste?.opportunity ?? null,
      hasDossier: hasDossier(id, root),
      hasCapture: existsSync(join(dir, "capture.json")),
      hasBlueprint: existsSync(join(dir, "blueprint.md")),
    });
  }
}

emit({ action: "blueprint-pending", count: items.length, items });
