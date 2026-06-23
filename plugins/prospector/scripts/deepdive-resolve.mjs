// Mark a deep-dive request handled once the agent has written its dossier(s). Appends a
// result so the request drains from the pending queue (the loop never touches deepdive).

import { appendResult, storeRoot, touchHeartbeat } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
touchHeartbeat(root);
const req = readRequest();
if (!req.reqId) { emit({ action: "deepdive-resolve", ok: false, error: "reqId required" }); process.exit(0); }

appendResult({ reqId: req.reqId, action: "deepdive", ok: true, summary: req.summary ?? "dossier(s) written" }, root);
emit({ action: "deepdive-resolve", ok: true, reqId: req.reqId });
