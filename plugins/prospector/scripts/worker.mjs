// Remote-worker HTTP client — used by the /prospector:prospect-worker skill to drain the hosted
// Prospector's agent queue from a LOCAL Claude Code session (off the user's subscription, free),
// with the cloud's metered API as the fallback. Talks to the bridge's /api/worker/* endpoints with a
// bearer token. Node 18+ (global fetch). Prints one JSON line per command.
//
//   node scripts/worker.mjs take <workdir>            # heartbeat+lease+pull → seeds <workdir>; prints {reqId,action,req} or {none:true}
//   node scripts/worker.mjs heartbeat [reqId]         # renew presence (+ a held lease); prints {canceled,revoked}
//   node scripts/worker.mjs finish <workdir> <reqId> [--fail] [--summary "…"]   # push <workdir> then complete (releases on push-fail)
//
// Env: PROSPECTOR_BRIDGE_URL + PROSPECTOR_WORKER_TOKEN (required), PROSPECTOR_WORKER_ID (optional).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

// Convenience: auto-load a `.env` from the directory you launched from, so PROSPECTOR_BRIDGE_URL /
// PROSPECTOR_WORKER_TOKEN can live in a file instead of being exported by hand. Real environment vars
// still win over the file. (Node >=20.12 has process.loadEnvFile; --env-file / `set -a; source .env`
// also work. Gitignore your .env — it holds a secret.)
try { if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env"); } catch { /* ignore */ }

const BASE = (process.env.PROSPECTOR_BRIDGE_URL || "").replace(/\/$/, "");
const TOKEN = process.env.PROSPECTOR_WORKER_TOKEN || "";
const WORKER_ID = process.env.PROSPECTOR_WORKER_ID || `${hostname()}-${process.pid}`;
const PUSH_DIRS = ["scope.json", "leads.md", "companies", "audits", "assessments", "dossiers", "outreach", "screenshots"];

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const die = (error) => { out({ ok: false, error }); process.exit(1); };
const auth = { authorization: `Bearer ${TOKEN}` };
const postJson = (path, body) => fetch(`${BASE}${path}`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!BASE || !TOKEN) die("set PROSPECTOR_BRIDGE_URL and PROSPECTOR_WORKER_TOKEN");
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === "heartbeat") {
    const reqId = args[0];
    const r = await postJson("/api/worker/heartbeat", { workerId: WORKER_ID, claudeAvailable: true, leases: reqId ? [reqId] : [] });
    return out(r.ok ? await r.json() : { ok: false, status: r.status });
  }

  if (cmd === "take") {
    const workdir = args[0];
    if (!workdir) die("usage: take <workdir>");
    await postJson("/api/worker/heartbeat", { workerId: WORKER_ID, claudeAvailable: true, leases: [] });
    const lr = await postJson("/api/worker/lease", { workerId: WORKER_ID });
    if (lr.status === 204) return out({ none: true });
    if (!lr.ok) return out({ ok: false, error: "lease failed", status: lr.status });
    const { reqId, req } = await lr.json();
    // pull the JSON store snapshot into <workdir>
    mkdirSync(workdir, { recursive: true });
    const pr = await fetch(`${BASE}/api/worker/pull?reqId=${encodeURIComponent(reqId)}`, { headers: auth });
    if (!pr.ok) return out({ ok: false, error: "pull failed", status: pr.status });
    const tmpTar = join(workdir, ".pull.tar.gz");
    writeFileSync(tmpTar, Buffer.from(await pr.arrayBuffer()));
    const x = spawnSync("tar", ["xzf", tmpTar, "-C", workdir], { stdio: ["ignore", "ignore", "pipe"] });
    if (x.status !== 0) return out({ ok: false, error: `extract failed: ${(x.stderr || "").toString().slice(0, 200)}` });
    // seed the workdir queue with ONLY this request so the existing skills process exactly it
    mkdirSync(join(workdir, "requests"), { recursive: true });
    writeFileSync(join(workdir, "requests", "queue.jsonl"), JSON.stringify(req) + "\n");
    return out({ ok: true, reqId, action: req.action, req });
  }

  if (cmd === "finish") {
    const [workdir, reqId, ...rest] = args;
    if (!workdir || !reqId) die("usage: finish <workdir> <reqId> [--fail] [--summary …]");
    const okFlag = !rest.includes("--fail");
    const si = rest.indexOf("--summary");
    const summary = si >= 0 ? rest.slice(si + 1).join(" ") : undefined;

    const names = PUSH_DIRS.filter((n) => existsSync(join(workdir, n)));
    const tar = spawnSync("tar", ["czf", "-", "-C", workdir, ...names], { maxBuffer: 2 * 1024 * 1024 * 1024 });
    if (tar.status !== 0) return out({ ok: false, error: "tar failed" });

    let pushed = false, lastErr = "";
    for (let i = 0; i < 3 && !pushed; i++) {
      try {
        const pr = await fetch(`${BASE}/api/worker/push?reqId=${encodeURIComponent(reqId)}`, { method: "POST", headers: { ...auth, "content-type": "application/gzip" }, body: tar.stdout });
        if (pr.ok) pushed = true; else lastErr = `push status ${pr.status}`;
      } catch (e) { lastErr = String(e?.message ?? e); }
      if (!pushed) await sleep(1000 * (i + 1));
    }
    if (!pushed) {
      // couldn't deliver results → release so the cloud re-runs it (don't claim success)
      await postJson("/api/worker/complete", { workerId: WORKER_ID, reqId, ok: false, summary: `push failed: ${lastErr}` });
      return out({ ok: false, error: `push failed: ${lastErr}` });
    }
    const cr = await postJson("/api/worker/complete", { workerId: WORKER_ID, reqId, ok: okFlag, summary });
    return out(cr.ok ? { ok: true, reqId, pushed: true } : { ok: false, error: "complete failed", status: cr.status });
  }

  die(`unknown command "${cmd ?? ""}". use: take | heartbeat | finish`);
}

main().catch((e) => die(String(e?.message ?? e)));
