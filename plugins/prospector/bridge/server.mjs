// Prospector bridge — a tiny zero-dependency local server. It is just a clickable
// remote for the agent: it serves the dashboard + the aggregated store, and turns
// button clicks into queued action requests that the dashboard skill's watch-loop runs.
//
// Security posture: LOCAL by default — binds 127.0.0.1 and rejects any non-loopback peer. When
// PROSPECTOR_PASSWORD is set (ONLINE mode) it binds 0.0.0.0 and gates every data route behind a
// shared-password session cookie instead. It never executes anything itself — it only reads the
// store and appends to the request queue (the workers run the actions).

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { aggregateStore, cancelRequest, enqueue, ensureStore, paths, readAssessment, readDossier, readJSON, readOutreach, readQueue, readResults, PLUGIN_ROOT, storeRoot } from "../lib/store.mjs";

// Auth posture: if PROSPECTOR_PASSWORD is set, the bridge runs in ONLINE mode — it binds 0.0.0.0 and
// gates every data route behind a shared-password cookie (for the hosted app). If it's unset, the
// bridge keeps its original LOCAL posture — binds 127.0.0.1 and rejects non-loopback peers (so
// `npm start` / the dashboard skill still work with no password). TLS is terminated by the host.
const PASSWORD = process.env.PROSPECTOR_PASSWORD || "";
const AUTH_ON = !!PASSWORD;
const SECRET = process.env.SESSION_SECRET || (PASSWORD ? `prospector:${PASSWORD}` : randomBytes(16).toString("hex"));
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const COOKIE = "prospector_session";

const HOST = AUTH_ON ? "0.0.0.0" : "127.0.0.1";
const PORT = Number(process.env.PORT ?? process.env.PROSPECTOR_PORT ?? 8092);
const DASH = join(PLUGIN_ROOT, "dashboard");
const ROOT = storeRoot();
ensureStore(ROOT);
// Version marker so a launcher can tell a CURRENT (standalone, agent-runner-capable) bridge apart
// from a stale pre-refactor one still squatting on the port — and replace it instead of reusing it.
const VERSION = (() => { try { return JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")).version; } catch { return null; } })();

const ACTIONS = new Set(["discover", "audit", "rank", "outreach", "outreach-save", "send", "scope", "delete", "shortlist", "setstatus", "deepdive", "hunt"]);
const LOG_FILE = process.env.PROSPECTOR_LOG ?? "/tmp/prospector-loop.log";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const isLoopback = (a) => a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";

// ---- shared-password auth (online mode only) --------------------------------
// A session cookie holds `<issuedAt>.<HMAC(SECRET, issuedAt)>` — stateless, tamper-proof, expiring.
const sign = (ts) => createHmac("sha256", SECRET).update(String(ts)).digest("base64url");
const makeToken = () => { const t = Date.now(); return `${t}.${sign(t)}`; };
const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
function validToken(tok) {
  if (typeof tok !== "string") return false;
  const i = tok.indexOf(".");
  if (i < 0) return false;
  const ts = tok.slice(0, i), sig = tok.slice(i + 1);
  const issuedAt = Number(ts);
  if (!issuedAt || Date.now() - issuedAt > SESSION_TTL_MS) return false;
  return eq(sig, sign(ts));
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
const isAuthed = (req) => !AUTH_ON || validToken(cookies(req)[COOKIE]);
const setCookie = (req, token, maxAge) => {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
};
// Data routes that must answer 401 (not an HTML redirect) when unauthenticated, so the dashboard's
// fetches can detect the lapsed session and bounce to /login.
const isApiPath = (p) => p.startsWith("/api/") || p === "/log" || p === "/dossier" || p === "/assessment" || p === "/outreach";

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

// ---- transcript / event parsing (one parser for both /log and the live /api/events stream) -------
const _trunc = (s, n) => { s = String(s ?? ""); return s.length > n ? `${s.slice(0, n)}… (+${s.length - n} chars)` : s; };
const _textOf = (content) => Array.isArray(content) ? content.map((b) => (typeof b === "string" ? b : b.text ?? b.content ?? "")).join("") : String(content ?? "");
const _firstLine = (s, n = 160) => _trunc(String(s ?? "").trim().split("\n").find((l) => l.trim()) ?? "", n);
const _inputSummary = (input) => {
  if (input == null) return "";
  if (typeof input.command === "string") return _trunc(input.command, 300);          // Bash
  if (typeof input.description === "string") return _trunc(input.description, 300);   // Task/agent
  if (typeof input.file_path === "string") return input.file_path;                    // Read/Write/Edit
  if (typeof input.query === "string") return _trunc(input.query, 200);               // WebSearch
  if (typeof input.url === "string") return input.url;                                // WebFetch
  if (typeof input.prompt === "string") return _trunc(input.prompt, 200);             // sub-task prompt
  return _trunc(JSON.stringify(input), 300);
};

/** Parse a logs/<id>.jsonl transcript into NORMALIZED, append-only events. Each event is one
 *  { seq, kind, who, label, detail } — `seq` is the event's index in this list (the stream cursor,
 *  stable as the file grows append-only). `kind` ∈ meta|prompt|system|msg|tool|tool_result|stderr|result. */
function eventsFromJsonl(jsonl) {
  const ev = [];
  const push = (o) => ev.push({ seq: ev.length, who: "claude", ...o });
  for (const raw of (jsonl || "").split("\n")) {
    if (!raw.trim()) continue;
    let e; try { e = JSON.parse(raw); } catch { continue; }
    if (e.type === "meta") push({ kind: "meta", label: `${e.action} · ${e.model ?? ""}`, detail: `${e.reqId} · started ${e.startedAt ? new Date(e.startedAt).toISOString() : "?"}` });
    else if (e.type === "prompt") push({ kind: "prompt", label: "prompt fed to claude", detail: _trunc(e.text, 8000) });
    else if (e.type === "system" && e.subtype === "init") push({ kind: "system", label: `session ${e.model ?? ""}`, detail: e.session_id ?? "" });
    else if (e.type === "assistant" && Array.isArray(e.message?.content)) {
      const who = e.parent_tool_use_id ? "subagent" : "claude";
      for (const b of e.message.content) {
        if (b.type === "text" && b.text?.trim()) push({ kind: "msg", who, label: _firstLine(b.text), detail: _trunc(b.text.trim(), 6000) });
        else if (b.type === "tool_use") push({ kind: "tool", who, label: b.name ?? "tool", detail: _inputSummary(b.input) });
      }
    } else if (e.type === "user" && Array.isArray(e.message?.content)) {
      for (const b of e.message.content) if (b.type === "tool_result") { const t = _textOf(b.content); push({ kind: "tool_result", who: "claude", label: _firstLine(t), detail: _trunc(t, 4000) }); }
    } else if (e.type === "stderr") push({ kind: "stderr", label: _firstLine(e.text), detail: _trunc(e.text, 2000) });
    else if (e.type === "result") push({ kind: "result", label: `${e.is_error ? "error" : "success"} · ${e.num_turns ?? "?"} turns · $${(e.total_cost_usd ?? 0).toFixed(4)}`, detail: _trunc(e.result ?? "", 2000) });
  }
  return ev;
}

/** Render the normalized events into the readable plain-text transcript served by /log. */
function renderTranscript(jsonl) {
  const ICON = { meta: "#", prompt: "📝", system: "●", msg: "🧠", tool: "🔧", tool_result: "↩", stderr: "⚠", result: "✅" };
  return eventsFromJsonl(jsonl).map((e) => {
    if (e.kind === "meta") return `# ${e.label} · ${e.detail}\n`;
    if (e.kind === "prompt") return `── prompt fed to claude ───────\n${e.detail}\n───────────────────────────────\n`;
    if (e.kind === "system") return `● ${e.label} · ${e.detail}`;
    if (e.kind === "msg") return `\n🧠 ${e.who}: ${e.detail}`;
    if (e.kind === "tool") return `🔧 ${e.who} → ${e.label}(${e.detail})`;
    if (e.kind === "tool_result") return `↩  ${e.detail}`;
    if (e.kind === "stderr") return `⚠ ${e.detail}`;
    if (e.kind === "result") return `\n${e.label.startsWith("error") ? "❌" : "✅"} ${e.label}${e.detail ? `\n${e.detail}` : ""}`;
    return `${ICON[e.kind] ?? ""} ${e.label}`;
  }).join("\n");
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const path = url.pathname;

  // ---- auth (online mode) ----
  // Public endpoints first, then the gate. In local mode (no password) keep the loopback-only guard.
  if (path === "/login" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let pw = "";
      try { pw = String(JSON.parse(body || "{}").password ?? ""); } catch { return sendJSON(res, 400, { error: "bad json" }); }
      if (!AUTH_ON || !eq(pw, PASSWORD)) return sendJSON(res, 401, { error: "wrong password" });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "set-cookie": setCookie(req, makeToken(), Math.floor(SESSION_TTL_MS / 1000)) });
      return res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (path === "/logout") {
    res.writeHead(302, { "set-cookie": setCookie(req, "", 0), location: "/login" });
    return res.end();
  }
  if (path === "/login" || path === "/login.html") return sendFile(res, join(DASH, "login.html"));
  if (path === "/favicon.ico") { res.writeHead(204); return res.end(); }

  if (AUTH_ON) {
    if (!isAuthed(req)) {
      if (isApiPath(path)) return sendJSON(res, 401, { error: "unauthorized" });
      res.writeHead(302, { location: "/login" }); // page/asset request → bounce to login
      return res.end();
    }
  } else if (!isLoopback(req.socket.remoteAddress)) {
    res.writeHead(403);
    return res.end("loopback only");
  }

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

  // Live agent event stream (offset-polled): normalized events past `after` for one request, so the
  // dashboard can append a detailed, streaming log. Cold read (after=0) is capped to the last 250.
  if (path === "/api/events" && req.method === "GET") {
    const id = (url.searchParams.get("reqId") ?? "").replace(/[^A-Za-z0-9_-]/g, "");
    const after = Math.max(0, parseInt(url.searchParams.get("after") ?? "0", 10) || 0);
    const file = join(paths(ROOT).logs, `${id}.jsonl`);
    if (!id || !existsSync(file)) return sendJSON(res, 200, { reqId: id, total: 0, skipped: 0, events: [] });
    const all = eventsFromJsonl(readFileSync(file, "utf8"));
    const total = all.length;
    let events = after > 0 ? all.filter((e) => e.seq >= after) : all;
    let skipped = 0;
    if (after === 0 && events.length > 250) { skipped = events.length - 250; events = events.slice(-250); }
    return sendJSON(res, 200, { reqId: id, total, skipped, events });
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

  // outreach package (email + text + researched contacts + send state) for a company
  if (path === "/outreach" && req.method === "GET") {
    const id = url.searchParams.get("id") ?? "";
    const o = readOutreach(id, ROOT);
    if (o == null) return sendJSON(res, 404, { error: "no outreach" });
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(o));
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
  console.log(`prospector bridge on http://${HOST}:${PORT}  · store=${ROOT}  · ${AUTH_ON ? "ONLINE (password auth)" : "LOCAL (loopback only)"}`);
  startWorkers();
});
