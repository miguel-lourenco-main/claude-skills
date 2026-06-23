// List audits that are captured but awaiting visual grading, with ABSOLUTE screenshot
// paths so the agent can Read them and grade. The taste pass is agent work (vision),
// not a headless script — this just hands the agent its worklist.

import { join } from "node:path";
import { listCompanyIds, paths, readAudit, readCompany, storeRoot, touchHeartbeat } from "../lib/store.mjs";
import { emit } from "./_cli.mjs";

const root = storeRoot();
touchHeartbeat(root); // a session checking the worklist = agent present
const dir = paths(root).screenshots;
const items = [];

for (const id of listCompanyIds(root)) {
  const a = readAudit(id, root);
  if (!(a?.reachable && a.taste?.pending)) continue;
  const c = readCompany(id, root);
  const files = [...(a.screenshots?.desktop ?? []), ...(a.screenshots?.mobile ?? [])].map((f) => join(dir, id, f));
  items.push({
    companyId: id,
    name: c?.name,
    url: a.url,
    vertical: c?.sector?.vertical,
    tech: a.tech,
    thumbnail: a.screenshots?.thumbnail ? join(dir, id, a.screenshots.thumbnail) : null,
    screenshots: files,
  });
}

emit({ action: "pending", count: items.length, items });
