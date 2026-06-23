// Mark a hunt request handled once the agent has filled the quota (or stopped). Appends a
// result so the request drains from the pending queue (the loop never runs hunt itself).

import { appendResult, storeRoot, touchHeartbeat } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
touchHeartbeat(root);
const req = readRequest();
if (!req.reqId) { emit({ action: "hunt-resolve", ok: false, error: "reqId required" }); process.exit(0); }

appendResult({ reqId: req.reqId, action: "hunt", ok: req.ok !== false, canceled: req.canceled || undefined, summary: req.summary ?? "hunt complete" }, root);
emit({ action: "hunt-resolve", ok: true, reqId: req.reqId });
