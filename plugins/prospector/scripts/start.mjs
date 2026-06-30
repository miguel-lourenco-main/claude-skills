#!/usr/bin/env node
// Prospector standalone launcher — `npm start` (or `prospector`). Boots the whole app in ONE
// foreground process: the bridge (HTTP + dashboard) which in turn owns the watch-loop AND the
// headless-claude agent-runner, then opens the dashboard in the browser. Ctrl-C stops everything.
//
// No separate Claude Code session is needed: queued hunt/deep-dive actions are drained by a
// `claude` CLI the app spawns itself. Prereqs: `node`, a `claude` CLI on PATH (authenticated),
// and `npm install` (Playwright, for website capture).
//
// SELF-HEALING: if a bridge is already serving the port, this checks whether it is the CURRENT
// standalone build. If it's stale (an older version, or a pre-refactor bridge with no agent-runner —
// which silently keeps draining nothing), it is replaced with fresh code rather than reused. THIS is
// the fix for "it still uses the bridged session": a leftover old bridge never started the agent-runner.
//
// Config (env): PROSPECTOR_PORT (8092) · PROSPECTOR_ROOT (./.prospector) ·
//   PROSPECTOR_CLAUDE_MODEL (opus) · PROSPECTOR_CLAUDE_BYPASS=1 · PROSPECTOR_NO_OPEN=1.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureStore, storeRoot, PLUGIN_ROOT } from "../lib/store.mjs";

const PORT = Number(process.env.PROSPECTOR_PORT ?? 8092);
const base = `http://127.0.0.1:${PORT}`;
const url = `${base}/`;
const VERSION = (() => { try { return JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")).version; } catch { return null; } })();

ensureStore(storeRoot());

function openBrowser(u) {
  if (process.env.PROSPECTOR_NO_OPEN === "1") return;
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", u] : [u];
  try { spawn(cmd, args, { stdio: "ignore", detached: true }).unref(); } catch { /* best-effort */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getStatus() {
  try { const r = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(900) }); return r.ok ? await r.json() : null; }
  catch { return null; }
}

// ---- ensure the CURRENT bridge owns the port -----------------------------------------------------
const st = await getStatus();
if (st && st.standalone && st.version === VERSION) {
  console.log(`▸ Prospector already running (v${VERSION}) → ${url}`);
  openBrowser(url);
  process.exit(0);
}
if (st) {
  // A bridge is serving but it's NOT the current standalone build — replace it.
  const what = st.standalone ? `v${st.version}` : "a pre-standalone bridge (no agent-runner)";
  console.log(`▸ Replacing stale Prospector (${what}) with v${VERSION}…`);
  if (st.standalone) {
    try { await fetch(`${base}/api/shutdown`, { method: "POST", signal: AbortSignal.timeout(900) }); } catch { /* may drop the connection as it dies */ }
  } else {
    // Old bridge can't shut itself down — kill the leftover worker processes (best-effort, unix).
    for (const pat of ["bridge/server.mjs", "scripts/loop.mjs", "scripts/agent-runner.mjs"]) {
      try { spawn("pkill", ["-f", pat], { stdio: "ignore" }); } catch { /* ignore */ }
    }
  }
  // Wait for the port to actually free before we bind it (up to ~6s).
  for (let i = 0; i < 30 && (await getStatus()); i++) await sleep(200);
}

// ---- start fresh in THIS process so Ctrl-C tears down bridge + both workers -----------------------
setTimeout(() => { console.log(`\n▸ Prospector dashboard → ${url}\n  (agent actions run via a headless 'claude'; Ctrl-C stops the app)\n`); openBrowser(url); }, 1200);
await import("../bridge/server.mjs");
