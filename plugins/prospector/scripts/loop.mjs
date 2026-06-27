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

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendResult, ensureStore, paths, readCancels, readQueue, readResults, storeRoot, writeJSON, PLUGIN_ROOT } from "../lib/store.mjs";

const SCRIPTS = {
  discover: "discover.mjs",
  audit: "audit.mjs",
  rank: "rank.mjs",
  scope: "scope.mjs",
  delete: "delete.mjs",
  shortlist: "shortlist.mjs",
  setstatus: "setstatus.mjs",
  "outreach-save": "outreach-save.mjs", // persist operator edits / validation / status (no agent, no cost)
  send: "send.mjs",                     // send one validated email via SMTP (a bundle = many of these)
};

// Actions the LOOP must NOT run — they need open-ended LLM research. The companion worker
// scripts/agent-runner.mjs drains these by spawning a headless `claude` (the standalone app runs
// both workers). This loop simply leaves them for that worker so neither double-processes.
// `outreach` is agent-driven (research contacts + draft email/text); `outreach-save`/`send` are the
// deterministic follow-ups the loop DOES run.
const AGENT_ACTIONS = new Set(["deepdive", "hunt", "outreach"]);

const root = storeRoot();
ensureStore(root);
const once = process.argv.includes("--once");
const done = new Set(readResults(root).map((r) => r.reqId).filter(Boolean));

const summarize = (result) =>
  result ? Object.entries(result).filter(([k]) => !["ok", "action"].includes(k)).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : v}`).join(" ") || "ok" : "(no output)";

/** Marker the bridge reads for the "now running" indicator in the Activity console. Held in
 *  memory too so per-item progress can be merged in without re-reading the file. */
let runningMarker = null;
function setRunning(req) {
  const label = req ? `${req.action}${req.companyIds?.length ? ` (${req.companyIds.length})` : req.payload?.area ? ` · ${req.payload.area}` : ""}` : null;
  runningMarker = req ? { reqId: req.id, action: req.action, label, startedAt: Date.now() } : null;
  writeJSON(paths(root).running, runningMarker ?? { running: null });
}

/** Merge a per-item progress event (from a child's stderr) into the live running marker. */
function setProgress(p) {
  if (!runningMarker) return;
  runningMarker.progress = { i: p.i, n: p.n, item: p.item, phase: p.phase, message: p.message, updatedAt: Date.now() };
  writeJSON(paths(root).running, runningMarker);
  const n = p.n != null ? `/${p.n}` : "";
  const head = p.i != null ? `${p.i}${n} ` : "";
  console.log(`  · ${head}${p.item ?? ""}${p.phase ? ` — ${p.phase}` : ""}${p.message ? `: ${p.message}` : ""}`.trimEnd());
}

/** Feed a child's stderr chunk through a line buffer: progress lines update the marker; any
 *  other stderr is kept (bounded) for the result's error slice. Returns the leftover buffer. */
function consumeStderr(c, chunk) {
  c.errBuf += chunk.toString();
  let nl;
  while ((nl = c.errBuf.indexOf("\n")) >= 0) {
    const line = c.errBuf.slice(0, nl);
    c.errBuf = c.errBuf.slice(nl + 1);
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("{") && t.includes("__progress")) {
      try { const o = JSON.parse(t); if (o.__progress) { setProgress(o); continue; } } catch { /* not progress → keep */ }
    }
    if (c.err.length < 4000) c.err += line + "\n"; // real stderr, bounded
  }
}

// One request runs at a time. Async (not spawnSync) so the loop can react to a cancel
// while a long action (e.g. a 375-site audit) is in flight.
let current = null;          // { req, child, startedAt, queuedAtMs, out, err, canceling }
const canceled = new Set();  // reqIds known canceled (so we don't restart them)

const qMs = (req) => (req.queuedAt ? new Date(req.queuedAt).getTime() : Date.now());

/** Stop a child gracefully: SIGTERM the action process (it traps this, finishes the current
 *  item safely, saves completed work + emits a partial result), then SIGKILL the whole process
 *  group as a fallback if it doesn't exit (also reaps Playwright/Chrome). */
function killTree(child) {
  try { process.kill(child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* gone */ } }
  setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ } }, 8000);
}

/** Read cancel markers: flag matching queued reqs, and kill the running one if it's targeted. */
function refreshCancels() {
  const { ids, allBefore } = readCancels(root);
  const isCanceled = (id, ms) => ids.has(id) || (allBefore && ms <= allBefore);
  for (const req of readQueue(root)) {
    if (done.has(req.id)) continue;
    if (isCanceled(req.id, qMs(req))) canceled.add(req.id);
  }
  if (current && !current.canceling && isCanceled(current.req.id, current.queuedAtMs)) {
    current.canceling = true;
    console.log(`⏹ canceling ${current.req.action} ${current.req.id}…`);
    killTree(current.child);
  }
}

function startReq(req) {
  const script = SCRIPTS[req.action];
  done.add(req.id); // claim it so we never start it twice
  if (!script) { appendResult({ reqId: req.id, action: req.action, ok: false, summary: "unknown action" }, root); return; }
  setRunning(req);
  const child = spawn("node", [join(PLUGIN_ROOT, "scripts", script), JSON.stringify(req)], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  // Per-request detailed log: full stdout + stderr of the action script (mirrors the agent-runner's
  // transcript for the deterministic actions). Opened fresh each run.
  let logFile = null;
  try { mkdirSync(paths(root).logs, { recursive: true }); logFile = join(paths(root).logs, `${req.id}.log`); writeFileSync(logFile, `# ${req.action} ${req.id} · ${new Date().toISOString()}\n# ${JSON.stringify(req)}\n\n`); } catch { /* best-effort */ }
  const logAppend = (s) => { if (logFile) try { appendFileSync(logFile, s); } catch { /* ignore */ } };
  current = { req, child, startedAt: Date.now(), queuedAtMs: qMs(req), out: "", err: "", errBuf: "", canceling: false };
  child.stdout.on("data", (d) => { current.out += d.toString(); logAppend(d.toString()); });
  child.stderr.on("data", (d) => { consumeStderr(current, d); logAppend(d.toString()); });
  child.on("exit", (_code, signal) => onExit(req, signal));
  child.on("error", () => onExit(req, "error"));
}

function onExit(req, signal) {
  const c = current;
  current = null;
  const wasCanceled = !!c?.canceling || canceled.has(req.id);
  let result = null;
  const last = (c?.out || "").trim().split("\n").filter(Boolean).pop();
  try { result = last ? JSON.parse(last) : null; } catch { /* keep raw */ }
  const ms = Date.now() - (c?.startedAt ?? Date.now());
  // Prefer the script's own (possibly PARTIAL) result — a graceful cancel still emits one,
  // so completed work + a real summary are kept. Only fall back to "canceled" if hard-killed.
  const summary = result ? summarize(result) : wasCanceled ? "canceled" : "(no output)";
  const ok = result ? !!result.ok : false;
  const tag = wasCanceled ? (result ? "CANCELED (partial saved)" : "CANCELED") : ok ? "ok" : "FAILED";
  appendResult({ reqId: req.id, action: req.action, ok, canceled: wasCanceled || undefined, ms, summary, result, stderr: (c?.err || "").slice(0, 500) || undefined }, root);
  setRunning(null);
  console.log(`▸ ${req.action} ${req.id} → ${tag} ${summary} (${ms}ms)`);
  pump();
}

/** Start the next runnable request if idle; drop canceled queued ones. */
function pump() {
  if (current) return;
  for (const req of readQueue(root)) {
    if (done.has(req.id)) continue;
    if (AGENT_ACTIONS.has(req.action)) continue; // left for the agent
    if (canceled.has(req.id)) { done.add(req.id); appendResult({ reqId: req.id, action: req.action, ok: false, canceled: true, summary: "canceled" }, root); console.log(`▸ ${req.action} ${req.id} → CANCELED (queued)`); continue; }
    startReq(req);
    return;
  }
  if (once) process.exit(0); // --once: nothing left → done
}

function tick() { refreshCancels(); pump(); }

/** Single-instance guard for the watch loop — never run two loops on one store (they'd
 *  double-process the queue). A stale lock (dead pid) is taken over. */
function acquireLock() {
  const lockFile = join(paths(root).requests, "loop.lock");
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  if (existsSync(lockFile)) {
    const pid = Number(readFileSync(lockFile, "utf8").trim());
    if (pid && pid !== process.pid && alive(pid)) {
      console.log(`prospector loop already running (pid ${pid}) — exiting.`);
      process.exit(0);
    }
  }
  writeFileSync(lockFile, String(process.pid));
  const release = () => {
    try { if (current?.child?.pid) process.kill(-current.child.pid, "SIGKILL"); } catch { /* gone */ }
    try { if (existsSync(lockFile) && Number(readFileSync(lockFile, "utf8")) === process.pid) unlinkSync(lockFile); } catch { /* ignore */ }
  };
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { release(); process.exit(0); });
}

if (once) {
  pump(); // async chain drains the queue, then exits
} else {
  acquireLock();
  console.log(`prospector loop watching ${root} (pid ${process.pid}) … (Ctrl-C to stop)`);
  tick();
  setInterval(tick, 1000);
}
