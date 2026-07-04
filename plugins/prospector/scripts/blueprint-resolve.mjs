// Mark a blueprint request handled once the agent has written blueprints/<id>/blueprint.md.
// Appends a result so the request drains from the pending queue (the loop never touches blueprint).

import { appendResult, storeRoot, touchHeartbeat } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
touchHeartbeat(root);
const req = readRequest();
if (!req.reqId) { emit({ action: "blueprint-resolve", ok: false, error: "reqId required" }); process.exit(0); }

appendResult({ reqId: req.reqId, action: "blueprint", ok: true, summary: req.summary ?? "blueprint written" }, root);
emit({ action: "blueprint-resolve", ok: true, reqId: req.reqId });
