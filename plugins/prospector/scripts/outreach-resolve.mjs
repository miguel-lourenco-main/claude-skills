// Mark an outreach (agent) request handled once the agent has drafted all its companies (or stopped).
// Appends a result so the request drains from the pending queue. In the standalone app the
// agent-runner also records a result on the headless claude's exit; this exists for the human-session
// fallback (running /prospector:prospect-outreach by hand) and to leave a clean summary line.

import { appendResult, storeRoot, touchHeartbeat } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
touchHeartbeat(root);
const req = readRequest();
if (!req.reqId) { emit({ action: "outreach-resolve", ok: false, error: "reqId required" }); process.exit(0); }

appendResult({ reqId: req.reqId, action: "outreach", ok: req.ok !== false, canceled: req.canceled || undefined, summary: req.summary ?? "outreach drafted" }, root);
emit({ action: "outreach-resolve", ok: true, reqId: req.reqId });
