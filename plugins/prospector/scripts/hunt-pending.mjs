// List the hunt requests awaiting the agent (queued `hunt`, not yet resolved), each with
// its full options payload (lead types, filters, quota…). Touches the heartbeat.

import { readQueue, readResults, storeRoot, touchHeartbeat } from "../lib/store.mjs";
import { emit } from "./_cli.mjs";

const root = storeRoot();
touchHeartbeat(root);
const handled = new Set(readResults(root).map((r) => r.reqId).filter(Boolean));
const items = readQueue(root)
  .filter((r) => r.action === "hunt" && !handled.has(r.id))
  .map((r) => ({ reqId: r.id, queuedAt: r.queuedAt, payload: r.payload ?? {} }));

emit({ action: "hunt-pending", count: items.length, items });
