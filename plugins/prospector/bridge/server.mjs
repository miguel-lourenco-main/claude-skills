// Prospector bridge — a tiny zero-dependency local server. It is just a clickable
// remote for the agent: it serves the dashboard + the aggregated store, and turns
// button clicks into queued action requests that the dashboard skill's watch-loop runs.
//
// Security posture: binds 127.0.0.1 only and rejects any non-loopback peer. It never
// executes anything itself — it only reads the store and appends to the request queue.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { aggregateStore, cancelRequest, enqueue, ensureStore, paths, readAssessment, readDossier, readJSON, readQueue, readResults, PLUGIN_ROOT, storeRoot } from "../lib/store.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PROSPECTOR_PORT ?? 8092);
const DASH = join(PLUGIN_ROOT, "dashboard");
const ROOT = storeRoot();
ensureStore(ROOT);
// Version marker so a launcher can tell a CURRENT (standalone, agent-runner-capable) bridge apart
// from a stale pre-refactor one still squatting on the port — and replace it instead of reusing it.
const VERSION = (() => { try { return JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")).version; } catch { return null; } })();

const ACTIONS = new Set(["discover", "audit", "rank", "outreach", "scope", "delete", "shortlist", "deepdive", "hunt"]);
const LOG_FILE = process.env.PROSPECTOR_LOG ?? "/tmp/prospector-loop.log";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const isLoopback = (a) => a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(body);
}

function sendFile(res, file) {
  if (!existsSync(file)) return send404(res);
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
}

function send404(res) {
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}

/** A generated placeholder so the detail panel looks complete without binary assets. */
function placeholderSVG(res, label) {
  const txt = decodeURIComponent(label).replace(/\.png$/, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <rect width="640" height="400" fill="#16140f"/>
  <rect x="0.5" y="0.5" width="639" height="399" fill="none" stroke="#2a2722"/>
  <text x="320" y="196" fill="#6c6860" font-family="Inter,system-ui,sans-serif" font-size="22" text-anchor="middle">screenshot</text>
  <text x="320" y="224" fill="#908b80" font-family="Inter,system-ui,sans-serif" font-size="15" text-anchor="middle">${txt}</text>
</svg>`;
  res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
  res.end(svg);
}

/** Render an agent-action transcript (logs/<id>.jsonl of raw claude stream events) into a readable
 *  log: prompt, every assistant message + tool call, tool results, stderr, and the final verdict. */
function renderTranscript(jsonl) {
  const out = [];
  const trunc = (s, n) => { s = String(s ?? ""); return s.length > n ? `${s.slice(0, n)}… (+${s.length - n} chars)` : s; };
  const textOf = (content) => Array.isArray(content) ? content.map((b) => (typeof b === "string" ? b : b.text ?? b.content ?? "")).join("") : String(content ?? "");
  for (const raw of jsonl.split("\n")) {
    if (!raw.trim()) continue;
    let e; try { e = JSON.parse(raw); } catch { continue; }
    if (e.type === "meta") out.push(`# ${e.action} · ${e.reqId} · model ${e.model} · ${new Date(e.startedAt).toISOString()}\n`);
    else if (e.type === "prompt") out.push(`── prompt fed to claude ───────\n${trunc(e.text, 4000)}\n───────────────────────────────\n`);
    else if (e.type === "system" && e.subtype === "init") out.push(`● session ${e.session_id ?? ""} · ${e.model ?? ""}`);
    else if (e.type === "assistant" && Array.isArray(e.message?.content)) {
      const who = e.parent_tool_use_id ? "subagent" : "claude";
      for (const b of e.message.content) {
        if (b.type === "text" && b.text?.trim()) out.push(`\n🧠 ${who}: ${b.text.trim()}`);
        else if (b.type === "tool_use") out.push(`🔧 ${who} → ${b.name}(${trunc(JSON.stringify(b.input ?? {}), 400)})`);
      }
    } else if (e.type === "user" && Array.isArray(e.message?.content)) {
      for (const b of e.message.content) if (b.type === "tool_result") out.push(`↩  ${trunc(textOf(b.content), 1500)}`);
    } else if (e.type === "stderr") out.push(`⚠ ${String(e.text).trimEnd()}`);
    else if (e.type === "result") out.push(`\n${e.is_error ? "❌" : "✅"} ${e.subtype} · ${e.num_turns ?? "?"} turns · $${(e.total_cost_usd ?? 0).toFixed(4)}${e.result ? `\n${trunc(e.result, 1000)}` : ""}`);
  }
  return out.join("\n");
}

const server = createServer((req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) {
    res.writeHead(403);
    return res.end("loopback only");
  }
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const path = url.pathname;

  // ---- API ----
  if (path === "/api/store" && req.method === "GET") {
    return sendJSON(res, 200, aggregateStore(ROOT));
  }
  if (path === "/api/status" && req.method === "GET") {
    const results = readResults(ROOT);
    const handled = new Set(results.map((r) => r.reqId).filter(Boolean));
    const pending = readQueue(ROOT).filter((r) => !handled.has(r.id)).length;
    // `standalone` + `version` let a launcher detect this is the CURRENT bridge (with the headless
    // agent-runner) vs. a stale one; `workers` reports how many background workers are alive.
    return sendJSON(res, 200, { pending, results: results.slice(-20), standalone: true, version: VERSION, workers: workers.length });
  }
  if (path === "/api/activity" && req.method === "GET") {
    const results = readResults(ROOT);
    const handled = new Set(results.map((r) => r.reqId).filter(Boolean));
    const queue = readQueue(ROOT).filter((r) => !handled.has(r.id))
      .map((r) => ({ id: r.id, action: r.action, queuedAt: r.queuedAt, target: r.payload?.area ?? (r.companyIds ? `${r.companyIds.length} selected` : undefined) }));
    // Two workers can be busy at once (loop.mjs on a script action, agent-runner.mjs on a headless
    // hunt/deepdive) — each keeps its own marker. Surface the agent run first (it's the headline,
    // long-running task) and keep the script run as a fallback for the single-slot banner.
    const active = (m) => (m?.reqId && !handled.has(m.reqId) ? m : null);
    const scriptRun = active(readJSON(paths(ROOT).running));
    const agentRun = active(readJSON(paths(ROOT).agentRunning));
    const running = agentRun ?? scriptRun;
    let log = [];
    try { log = readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean).slice(-80); } catch { /* no log yet */ }
    return sendJSON(res, 200, {
      running,
      runs: [agentRun, scriptRun].filter(Boolean), // both, if two workers are busy
      pending: queue.length,
      queue,
      results: results.slice(-40).reverse().map((r) => ({ at: r.at, action: r.action, ok: r.ok, ms: r.ms, summary: r.summary, reqId: r.reqId, costUSD: r.costUSD })),
      log,
    });
  }
  if (path === "/api/action" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let action;
      try {
        action = JSON.parse(body || "{}");
      } catch {
        return sendJSON(res, 400, { error: "bad json" });
      }
      if (!ACTIONS.has(action.action)) return sendJSON(res, 400, { error: `unknown action; allowed: ${[...ACTIONS].join(", ")}` });
      const req2 = enqueue(action, ROOT);
      return sendJSON(res, 200, { ok: true, queued: req2 });
    });
    return;
  }
  // Graceful self-shutdown (loopback-only, like everything here) so a launcher can replace a running
  // bridge with fresh code without needing to find + kill its pid.
  if (path === "/api/shutdown" && req.method === "POST") {
    sendJSON(res, 200, { ok: true, bye: true });
    setTimeout(shutdown, 100); // flush the response, then tear down workers + exit
    return;
  }
  if (path === "/api/cancel" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let b;
      try { b = JSON.parse(body || "{}"); } catch { return sendJSON(res, 400, { error: "bad json" }); }
      cancelRequest({ reqId: b.reqId, all: b.all }, ROOT);
      return sendJSON(res, 200, { ok: true });
    });
    return;
  }

  // ---- store screenshots (placeholder if missing) ----
  if (path.startsWith("/screenshots/")) {
    const rel = normalize(path.replace(/^\/screenshots\//, "")).replace(/^(\.\.(\/|\\|$))+/, "");
    const file = join(paths(ROOT).screenshots, rel);
    if (existsSync(file)) return sendFile(res, file);
    return placeholderSVG(res, rel.split("/").pop() ?? "preview");
  }

  // per-action transcript: agent actions render the full claude stream (logs/<id>.jsonl); script
  // actions serve their raw stdout/stderr log (logs/<id>.log). ?raw=1 returns the unrendered jsonl.
  if (path === "/log" && req.method === "GET") {
    const id = (url.searchParams.get("reqId") ?? "").replace(/[^A-Za-z0-9_-]/g, ""); // no path traversal
    const raw = url.searchParams.get("raw") === "1";
    const jsonl = join(paths(ROOT).logs, `${id}.jsonl`);
    const plain = join(paths(ROOT).logs, `${id}.log`);
    let body = null;
    if (id && existsSync(jsonl)) body = raw ? readFileSync(jsonl, "utf8") : renderTranscript(readFileSync(jsonl, "utf8"));
    else if (id && existsSync(plain)) body = readFileSync(plain, "utf8");
    if (body == null) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("no log for this request yet"); }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    return res.end(body);
  }

  // deep-dive report (markdown) for a company
  if (path === "/dossier" && req.method === "GET") {
    const id = url.searchParams.get("id") ?? "";
    const md = readDossier(id, ROOT);
    if (md == null) return sendJSON(res, 404, { error: "no dossier" });
    res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" });
    return res.end(md);
  }

  // hunt assessment (verdict + pitch) for a company
  if (path === "/assessment" && req.method === "GET") {
    const id = url.searchParams.get("id") ?? "";
    const a = readAssessment(id, ROOT);
    if (a == null) return sendJSON(res, 404, { error: "no assessment" });
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(a));
  }

  if (path === "/favicon.ico") { res.writeHead(204); return res.end(); }

  // ---- static dashboard ----
  if (req.method === "GET") {
    const rel = path === "/" ? "index.html" : normalize(path).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\//, "");
    return sendFile(res, join(DASH, rel));
  }
  return send404(res);
});

// ---- single managed worker children ----------------------------------------
// The bridge OWNS both background workers — start one process, stop one process, no orphans:
//   loop.mjs         runs the deterministic action scripts (discover/audit/rank/…)
//   agent-runner.mjs spawns a headless `claude` for the open-ended actions (hunt/deepdive),
//                    making the app self-contained — no separate Claude session needed.
// (Set PROSPECTOR_NO_LOOP=1 to run the workers yourself instead.)
const workers = [];
function startWorkers() {
  if (process.env.PROSPECTOR_NO_LOOP === "1") return;
  let out = "ignore";
  try { out = openSync(LOG_FILE, "a"); } catch { /* fall back to ignore */ }
  // The agent-runner is the standalone autonomous drainer. Set PROSPECTOR_NO_AGENT=1 to omit it and
  // fall back to draining hunt/deepdive from a human Claude session (e.g. when no `claude` CLI is available).
  const scripts = process.env.PROSPECTOR_NO_AGENT === "1" ? ["loop.mjs"] : ["loop.mjs", "agent-runner.mjs"];
  for (const script of scripts) {
    const child = spawn("node", [join(PLUGIN_ROOT, "scripts", script)], { stdio: ["ignore", out, out], env: process.env });
    child.on("exit", () => { const i = workers.indexOf(child); if (i >= 0) workers.splice(i, 1); });
    workers.push(child);
  }
}
function shutdown() {
  for (const w of workers) { try { w.kill("SIGTERM"); } catch { /* gone */ } }
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Re-running the dashboard skill must REUSE a live bridge, not stack a second one.
server.on("error", (e) => {
  if (e?.code === "EADDRINUSE") {
    console.error(`prospector: port ${PORT} already serving — reusing the running bridge (not starting a second).`);
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`prospector bridge on http://${HOST}:${PORT}  · store=${ROOT}`);
  startWorkers();
});
