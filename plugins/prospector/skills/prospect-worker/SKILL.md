---
name: prospect-worker
description: Connect THIS local Claude Code session to the hosted Prospector and process its queued agent work (hunt / deep-dive / outreach) off your own subscription — so the cloud doesn't pay per-token. Use when the user says "connect to the server", "run the worker", "drain the cloud queue locally", "process Prospector remotely", or wants the local-first / free-agent mode. Leases one request at a time, runs the existing skill against a synced workdir, pushes results back. The cloud's metered API stays as the fallback when this session isn't connected.
---

# Prospect · worker (drain the hosted queue locally)

You are a **remote worker**: this session's Claude (your subscription) does the hosted Prospector's
agent work for free, instead of its cloud paying the metered API. You lease one queued request at a
time, run the normal procedure against a **synced workdir**, push the results back to the server, and
mark it done — looping until the user stops you.

## 0 · Setup (once)

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_BRIDGE_URL="https://prospector-leadgen.fly.dev"   # the hosted app
export PROSPECTOR_WORKER_TOKEN="…"                                  # matches the server's PROSPECTOR_WORKER_TOKEN
```

Confirm `claude` is logged in with your **subscription** (not an API key) — that's what makes this free.

## 1 · The loop

Repeat until the user says stop (or you've polled empty several times in a row):

1. **Take the next job** into a fresh workdir:
   ```bash
   WORK="$(mktemp -d)"
   node "$PLUGIN/scripts/worker.mjs" take "$WORK"
   ```
   - Prints `{"none":true}` → nothing queued. Wait ~15s and repeat (or stop if asked).
   - Prints `{"reqId":"…","action":"hunt|deepdive|outreach","req":{…}}` → note the `reqId` + `action`,
     then `export PROSPECTOR_ROOT="$WORK"` (the synced store snapshot, with this one request already in
     its queue).

2. **Do the work** — follow the EXISTING skill for that `action`, scoped to this `reqId`, against
   `$WORK` exactly as you would locally (the scripts read `$WORK`'s queue and write into `$WORK`):
   - `hunt` → **prospect-hunt**  ·  `deepdive` → **prospect-deepdive**  ·  `outreach` → **prospect-outreach**

   During a long run, every ~30s renew the lease so the cloud doesn't reclaim it:
   ```bash
   node "$PLUGIN/scripts/worker.mjs" heartbeat "<reqId>"
   ```
   If that output lists your `reqId` under `"canceled"` or `"revoked"`, **stop this run immediately**
   and go to step 3 (the server cancelled it, or the cloud already took it over).

3. **Push the results + mark done**:
   ```bash
   node "$PLUGIN/scripts/worker.mjs" finish "$WORK" "<reqId>" --summary "<one-line outcome>"
   rm -rf "$WORK"
   ```
   Add `--fail` instead if the run errored — that releases the request so the cloud re-runs it. Then
   loop back to step 1.

## Notes

- **One request at a time.** Lease → run → push → complete, then take the next. Don't hold several.
- The workdir is a **JSON-only** snapshot (no screenshots pulled — the agent doesn't need them as
  input); any screenshots you capture during an audit are pushed back with `finish`.
- Results stream into the hosted dashboard as you `finish` each one. While you're connected, the
  dashboard shows **"Local worker · running …"**; the cloud only pays for work you DON'T process.
- **Compliance:** this runs the hosted app's agent work through your personal subscription. That's the
  trade-off you accepted for free local processing; the cloud API path remains the compliant fallback.
- Stop whenever you like (Ctrl-C / tell me to stop). The cloud fallback resumes automatically a couple
  of minutes after your last heartbeat (or immediately if someone clicks **Reconnect** in the dashboard).
