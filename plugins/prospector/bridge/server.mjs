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
    return sendJSON(res, 200, { pending, results: results.slice(-20) });
  }
  if (path === "/api/activity" && req.method === "GET") {
    const results = readResults(ROOT);
    const handled = new Set(results.map((r) => r.reqId).filter(Boolean));
    const queue = readQueue(ROOT).filter((r) => !handled.has(r.id))
      .map((r) => ({ id: r.id, action: r.action, queuedAt: r.queuedAt, target: r.payload?.area ?? (r.companyIds ? `${r.companyIds.length} selected` : undefined) }));
    const runMarker = readJSON(paths(ROOT).running);
    const running = runMarker?.reqId && !handled.has(runMarker.reqId) ? runMarker : null;
    let log = [];
    try { log = readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean).slice(-80); } catch { /* no log yet */ }
    return sendJSON(res, 200, {
      running,
      pending: queue.length,
      queue,
      results: results.slice(-40).reverse().map((r) => ({ at: r.at, action: r.action, ok: r.ok, ms: r.ms, summary: r.summary })),
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

// ---- single managed loop child --------------------------------------------
// The bridge OWNS the watch-loop: one process to start, one to stop, no orphans.
// (Set PROSPECTOR_NO_LOOP=1 to run the loop yourself instead.)
let loopChild = null;
function startLoop() {
  if (process.env.PROSPECTOR_NO_LOOP === "1") return;
  let out = "ignore";
  try { out = openSync(LOG_FILE, "a"); } catch { /* fall back to ignore */ }
  loopChild = spawn("node", [join(PLUGIN_ROOT, "scripts", "loop.mjs")], { stdio: ["ignore", out, out], env: process.env });
  loopChild.on("exit", () => { loopChild = null; });
}
function shutdown() {
  try { loopChild?.kill("SIGTERM"); } catch { /* gone */ }
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
  startLoop();
});
