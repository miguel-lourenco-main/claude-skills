// Prospector bridge — a tiny zero-dependency local server. It is just a clickable
// remote for the agent: it serves the dashboard + the aggregated store, and turns
// button clicks into queued action requests that the dashboard skill's watch-loop runs.
//
// Security posture: binds 127.0.0.1 only and rejects any non-loopback peer. It never
// executes anything itself — it only reads the store and appends to the request queue.

import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { aggregateStore, enqueue, ensureStore, paths, readQueue, readResults, PLUGIN_ROOT, storeRoot } from "../lib/store.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PROSPECTOR_PORT ?? 8092);
const DASH = join(PLUGIN_ROOT, "dashboard");
const ROOT = storeRoot();
ensureStore(ROOT);

const ACTIONS = new Set(["discover", "audit", "score", "outreach", "scope"]);
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

  // ---- store screenshots (placeholder if missing) ----
  if (path.startsWith("/screenshots/")) {
    const rel = normalize(path.replace(/^\/screenshots\//, "")).replace(/^(\.\.(\/|\\|$))+/, "");
    const file = join(paths(ROOT).screenshots, rel);
    if (existsSync(file)) return sendFile(res, file);
    return placeholderSVG(res, rel.split("/").pop() ?? "preview");
  }

  // ---- static dashboard ----
  if (req.method === "GET") {
    const rel = path === "/" ? "index.html" : normalize(path).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\//, "");
    return sendFile(res, join(DASH, rel));
  }
  return send404(res);
});

server.listen(PORT, HOST, () => {
  console.log(`prospector bridge on http://${HOST}:${PORT}  · store=${ROOT}`);
});
