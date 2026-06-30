// Prospector agent-runner — the autonomous half of the standalone app. It drains the AGENT
// actions (hunt, deepdive) from the queue by spawning a HEADLESS `claude` CLI for each, so the
// app needs no separate, human-driven Claude session. Deterministic actions stay with loop.mjs;
// this worker owns the open-ended LLM ones. Both workers watch the same queue but claim DISJOINT
// action types, append id-keyed results, and run single-instance (requests/agent.lock).
//
//   node scripts/agent-runner.mjs          # watch forever
//   node scripts/agent-runner.mjs --once   # drain pending agent actions, then exit
//
// Config (env): PROSPECTOR_CLAUDE_MODEL (default "opus") · PROSPECTOR_CLAUDE_BIN (default "claude")
//   · PROSPECTOR_CLAUDE_BYPASS=1 (use --dangerously-skip-permissions instead of the allowlist).

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendResult, ensureStore, paths, readCancels, readQueue, readResults, storeRoot, writeJSON, PLUGIN_ROOT } from "../lib/store.mjs";

// action → the skill whose SKILL.md drives the headless claude (the skill stays the single source
// of truth for the agent's procedure; we just feed it in non-interactively, scoped to one reqId).
const AGENT_SKILLS = { hunt: "prospect-hunt", deepdive: "prospect-deepdive", outreach: "prospect-outreach" };
const MODEL = process.env.PROSPECTOR_CLAUDE_MODEL || "opus";
const CLAUDE_BIN = process.env.PROSPECTOR_CLAUDE_BIN || "claude";
const BYPASS = process.env.PROSPECTOR_CLAUDE_BYPASS === "1";
// Curated allowlist: exactly what the agent procedures need (node scripts + Playwright via Bash,
// live research, dossier/report writes, and subagent fan-out for hunts). Fails closed otherwise.
const ALLOWED_TOOLS = ["Bash", "WebSearch", "WebFetch", "Read", "Write", "Edit", "Glob", "Grep", "Task", "TodoWrite"];

const root = storeRoot();
ensureStore(root);
const once = process.argv.includes("--once");
const done = new Set(readResults(root).map((r) => r.reqId).filter(Boolean)); // already-handled reqIds
const canceled = new Set();

// ---- running marker (its OWN file, so this worker and loop.mjs never clobber each other) -------
let marker = null;
function writeMarker() { writeJSON(paths(root).agentRunning, marker ?? { running: null }); }
function setRunning(req) {
  marker = req
    ? { reqId: req.id, action: req.action, agent: true, startedAt: Date.now(),
        label: `${req.action}${req.payload?.area ? ` · ${req.payload.area}` : req.companyIds?.length ? ` (${req.companyIds.length})` : ""}` }
    : null;
  writeMarker();
}
/** Surface the agent's latest line of thought / tool use as live progress for the dashboard banner. */
function setProgress(message, phase = "working") {
  if (!marker) return;
  marker.progress = { phase, message: (message ?? "").replace(/\s+/g, " ").trim().slice(0, 200), tools: marker._tools ?? 0, updatedAt: Date.now() };
  writeMarker();
}

// ---- prompt: the skill, scoped to ONE queued request, run headless ----------------------------
function buildPrompt(req) {
  const md = readFileSync(join(PLUGIN_ROOT, "skills", AGENT_SKILLS[req.action], "SKILL.md"), "utf8");
  const lines = [
    "You are the Prospector autonomous worker running HEADLESS — no human is watching, so NEVER ask for",
    "confirmation and never stop to ask a question; make the sensible default choice and proceed.",
    `Environment: PROSPECTOR_ROOT=${root} · PLUGIN=${PLUGIN_ROOT} · CLAUDE_PLUGIN_ROOT=${PLUGIN_ROOT}.`,
    `ALWAYS run \`export PROSPECTOR_ROOT="${root}"\` before invoking the plugin's node scripts.`,
    `Process ONLY the queued request reqId="${req.id}" (action="${req.action}"). Ignore every other`,
    "pending/queued request — do not start work on, or resolve, any other reqId.",
    (req.action === "deepdive" || req.action === "outreach") && req.companyIds?.length ? `Target companyIds: ${JSON.stringify(req.companyIds)}.` : "",
    "Follow the skill below to completion, run its resolve/save step for this reqId, then print a",
    "single final line summarizing the outcome (e.g. \"qualified 10/10 · examined 15\").",
    "",
    `--- SKILL: ${AGENT_SKILLS[req.action]} ---`,
    md,
  ];
  return lines.filter((l) => l !== "").join("\n");
}

function claudeArgs() {
  const a = ["-p", "--output-format", "stream-json", "--verbose", "--model", MODEL, "--add-dir", root, "--add-dir", PLUGIN_ROOT];
  if (BYPASS) a.push("--dangerously-skip-permissions");
  else a.push("--permission-mode", "acceptEdits", "--allowedTools", ...ALLOWED_TOOLS);
  return a;
}

let current = null; // { req, child, startedAt, buf, err, result, canceling, logFile }
let claudeUnavailable = false; // set if `claude` isn't on PATH → leave agent actions for a human session

/** Per-request transcript: EVERY claude stream event, raw, one JSON object per line (the complete
 *  record the dashboard renders into a readable log). A `meta` header line opens the file. */
function logPath(reqId) { return join(paths(root).logs, `${reqId}.jsonl`); }
function openLog(req) {
  const file = logPath(req.id);
  mkdirSync(paths(root).logs, { recursive: true });
  writeFileSync(file, JSON.stringify({ type: "meta", reqId: req.id, action: req.action, model: MODEL, startedAt: Date.now() }) + "\n", "utf8");
  return file;
}
function logLine(c, obj) { try { appendFileSync(c.logFile, (typeof obj === "string" ? obj : JSON.stringify(obj)) + "\n"); } catch { /* best-effort */ } }

/** Line-buffer claude's stream-json stdout: persist every event to the transcript, then derive
 *  live progress (assistant text/tool_use) and capture the final result. */
function consumeStdout(c, chunk) {
  c.buf += chunk.toString();
  let nl;
  while ((nl = c.buf.indexOf("\n")) >= 0) {
    const line = c.buf.slice(0, nl).trim();
    c.buf = c.buf.slice(nl + 1);
    if (!line) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (c.logFile) logLine(c, line); // raw event → transcript
    if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) {
        if (b.type === "text" && b.text?.trim()) setProgress(b.text, "thinking");
        else if (b.type === "tool_use") { marker && (marker._tools = (marker._tools ?? 0) + 1); setProgress(`${b.name}${b.input?.description ? ` · ${b.input.description}` : ""}`, "tool"); }
      }
    } else if (ev.type === "result") {
      c.result = ev;
    }
  }
}

function startReq(req) {
  done.add(req.id); // claim it so we never start it twice
  if (!AGENT_SKILLS[req.action]) { appendResult({ reqId: req.id, action: req.action, ok: false, summary: "unknown agent action" }, root); return; }
  let prompt;
  try { prompt = buildPrompt(req); }
  catch (e) { appendResult({ reqId: req.id, action: req.action, ok: false, summary: `prompt build failed: ${e.message}` }, root); return; }
  setRunning(req);
  const child = spawn(CLAUDE_BIN, claudeArgs(), {
    cwd: PLUGIN_ROOT, detached: true, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PROSPECTOR_ROOT: root, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  });
  current = { req, child, startedAt: Date.now(), buf: "", err: "", result: null, canceling: false, logFile: openLog(req) };
  logLine(current, { type: "prompt", text: prompt }); // the exact instructions we fed claude
  child.stdin.on("error", () => {}); // child may exit before we finish writing
  child.stdin.write(prompt); child.stdin.end();
  child.stdout.on("data", (d) => consumeStdout(current, d));
  child.stderr.on("data", (d) => { const s = d.toString(); if (current.err.length < 4000) current.err += s; logLine(current, { type: "stderr", text: s }); });
  child.on("exit", (code, signal) => onExit(req, code, signal));
  child.on("error", (e) => {
    if (e.code === "ENOENT") {
      // No `claude` on PATH. Don't fail the request — UN-CLAIM it and stop, so it stays pending for a
      // human Claude session to drain via /prospector:prospect-hunt (the standalone path's fallback).
      claudeUnavailable = true;
      done.delete(req.id);
      current = null;
      setRunning(null);
      console.error(`✗ '${CLAUDE_BIN}' not found on PATH — agent actions (hunt/deepdive) will WAIT in the queue for a Claude session to drain them. Install/authenticate the claude CLI (or set PROSPECTOR_CLAUDE_BIN) and restart.`);
      return;
    }
    current.err += `spawn error: ${e.message}\n`;
    onExit(req, 1, "error");
  });
  console.log(`▸ ${req.action} ${req.id} → spawned ${CLAUDE_BIN} (model ${MODEL})`);
}

function onExit(req, code, signal) {
  const c = current; current = null;
  if (!c) return;
  const wasCanceled = !!c.canceling || canceled.has(req.id);
  const r = c.result;
  const ok = r ? (r.subtype === "success" && !r.is_error) : false;
  const summary = ok && r?.result
    ? String(r.result).split("\n").map((s) => s.trim()).filter(Boolean).pop()?.slice(0, 300)
    : wasCanceled ? "canceled"
    : (r?.result ? String(r.result).slice(0, 200) : (c.err.trim().split("\n").filter(Boolean).pop() || `claude exited ${code ?? signal}`).slice(0, 200));
  const ms = Date.now() - c.startedAt;
  appendResult({
    reqId: req.id, action: req.action, ok, canceled: wasCanceled || undefined, ms, summary,
    costUSD: r?.total_cost_usd, turns: r?.num_turns,
    denials: r?.permission_denials?.length || undefined,
    stderr: (c.err || "").slice(0, 500) || undefined,
  }, root);
  setRunning(null);
  const tag = wasCanceled ? "CANCELED" : ok ? "ok" : "FAILED";
  console.log(`▸ ${req.action} ${req.id} → ${tag} ${summary ?? ""} (${ms}ms${r?.total_cost_usd ? `, $${r.total_cost_usd.toFixed(2)}` : ""})`);
  pump();
}

/** Stop the headless claude gracefully (SIGTERM lets its in-flight scripts save partial work),
 *  then SIGKILL the whole process group as a fallback (reaps subagents / Playwright / Chrome). */
function killTree(child) {
  try { process.kill(child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* gone */ } }
  setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ } }, 12000);
}

const qMs = (req) => (req.queuedAt ? new Date(req.queuedAt).getTime() : Date.now());

function refreshCancels() {
  const { ids, allBefore } = readCancels(root);
  const isCanceled = (id, ms) => ids.has(id) || (allBefore && ms <= allBefore);
  for (const req of readQueue(root)) {
    if (done.has(req.id)) continue;
    if (isCanceled(req.id, qMs(req))) canceled.add(req.id);
  }
  if (current && !current.canceling && isCanceled(current.req.id, qMs(current.req))) {
    current.canceling = true;
    console.log(`⏹ canceling ${current.req.action} ${current.req.id}…`);
    killTree(current.child);
  }
}

/** Start the next runnable AGENT request if idle; drop canceled queued ones. */
function pump() {
  if (current || claudeUnavailable) return; // claude missing → leave agent actions for a human session
  for (const req of readQueue(root)) {
    if (done.has(req.id)) continue;
    if (!AGENT_SKILLS[req.action]) continue; // not ours — loop.mjs handles script actions
    if (canceled.has(req.id)) { done.add(req.id); appendResult({ reqId: req.id, action: req.action, ok: false, canceled: true, summary: "canceled" }, root); console.log(`▸ ${req.action} ${req.id} → CANCELED (queued)`); continue; }
    startReq(req);
    return;
  }
  if (once) process.exit(0);
}

function tick() { refreshCancels(); pump(); }

/** Single-instance guard — never run two agent-runners on one store (they'd double-spawn claude). */
function acquireLock() {
  const lockFile = join(paths(root).requests, "agent.lock");
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  if (existsSync(lockFile)) {
    const pid = Number(readFileSync(lockFile, "utf8").trim());
    if (pid && pid !== process.pid && alive(pid)) { console.log(`prospector agent-runner already running (pid ${pid}) — exiting.`); process.exit(0); }
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
  pump();
} else {
  acquireLock();
  console.log(`prospector agent-runner watching ${root} · model ${MODEL}${BYPASS ? " · bypass-perms" : " · curated allowlist"} (pid ${process.pid})`);
  tick();
  setInterval(tick, 1500);
}
