// Prospector watch-loop — drains the action queue and runs the matching action
// script for each request, appending an outcome to results.jsonl. Append-only and
// id-keyed, so it races safely with the bridge appending new requests.
//
//   node scripts/loop.mjs          # watch forever (Ctrl-C to stop)
//   node scripts/loop.mjs --once   # drain whatever is pending, then exit
//
// Stub phase: every action is a deterministic script. Next phase, actions that need
// real LLM reasoning (discovery, vision taste) are run by the agent invoking the
// matching prospect-* skill instead — same request contract.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { appendResult, ensureStore, readQueue, readResults, storeRoot, PLUGIN_ROOT } from "../lib/store.mjs";

const SCRIPTS = {
  discover: "discover.mjs",
  audit: "audit.mjs",
  score: "score.mjs",
  outreach: "outreach.mjs",
  scope: "scope.mjs",
};

const root = storeRoot();
ensureStore(root);
const once = process.argv.includes("--once");
const done = new Set(readResults(root).map((r) => r.reqId).filter(Boolean));

function runOne(req) {
  const script = SCRIPTS[req.action];
  if (!script) {
    appendResult({ reqId: req.id, action: req.action, ok: false, error: "unknown action" }, root);
    return;
  }
  const r = spawnSync("node", [join(PLUGIN_ROOT, "scripts", script), JSON.stringify(req)], { encoding: "utf8" });
  let result = null;
  const out = (r.stdout || "").trim().split("\n").filter(Boolean).pop();
  try { result = out ? JSON.parse(out) : null; } catch { /* keep raw */ }
  appendResult({ reqId: req.id, action: req.action, ok: !!result?.ok, result, stderr: (r.stderr || "").slice(0, 500) || undefined }, root);
  const summary = result ? Object.entries(result).filter(([k]) => !["ok", "action"].includes(k)).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : v}`).join(" ") : "(no output)";
  console.log(`▸ ${req.action} ${req.id} → ${result?.ok ? "ok" : "FAILED"} ${summary}`);
}

function tick() {
  let ran = 0;
  for (const req of readQueue(root)) {
    if (done.has(req.id)) continue;
    done.add(req.id);
    runOne(req);
    ran++;
  }
  return ran;
}

if (once) {
  const n = tick();
  console.log(`drained ${n} request(s).`);
} else {
  console.log(`prospector loop watching ${root} … (Ctrl-C to stop)`);
  tick();
  setInterval(tick, 1000);
}
