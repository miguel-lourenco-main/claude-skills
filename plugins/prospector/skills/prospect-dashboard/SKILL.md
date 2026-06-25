---
name: prospect-dashboard
description: Open the Prospector dashboard — a local HTML console to view discovered companies, their website audits and lead scores, and to trigger the prospecting actions (discover, audit, score, outreach, edit scope). Use when the user says "open/run/launch the prospector dashboard", "show me my leads", "open prospector", or wants to view/triage the company pipeline in the browser. Starts a local bridge + a watch-loop so the dashboard's buttons execute live.
---

# Prospector dashboard

Serves the Prospector console and starts the two **background workers** that turn the dashboard's
button clicks into real work. Architecture: the browser only reads the store and enqueues actions;
a `loop.mjs` worker drains the deterministic actions (discover/audit/rank/…) and an `agent-runner.mjs`
worker drains the open-ended ones (hunt/deep-dive) by spawning a **headless `claude` CLI** — so the
app is **standalone** and needs no separate Claude session. The page re-reads the store every ~2s.

> **Standalone launch (recommended):** `npm start` (from the plugin dir) boots the bridge + both
> workers and opens the dashboard. Everything below is what that launcher automates; you only need
> the manual steps when embedding the dashboard inside an existing Claude session.

> The store is the database, the skills are functions over it, and the bridge is a clickable remote.
> Companies, audits and scope live under the **store root** (not in the plugin), so your data persists
> across sessions and updates.

## 0 · Locate the plugin + store root

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
export PROSPECTOR_ROOT
echo "plugin: $PLUGIN"
echo "store : $PROSPECTOR_ROOT"
```

If `$PLUGIN/bridge/server.mjs` is missing, the plugin isn't reachable — tell the user to run from a
context where the `prospector` plugin is installed (or set `$CLAUDE_PLUGIN_ROOT`). Prereq: `node`.
On first run the store auto-seeds from the bundled `sample-store/` (≈8 sample PT companies) so the
dashboard is never empty.

## 1 · Serve + open

Prefer `npm start` (it boots the bridge + both workers and self-heals a stale bridge). To launch
manually, start **only the bridge** — it owns and manages BOTH workers (the watch-loop and the
headless-claude agent-runner) as children. **Reuse a running bridge only if it's the CURRENT build:**
a leftover *pre-standalone* bridge (no `standalone` flag in `/api/status`) never started the
agent-runner, so hunt/deep-dive would silently fall back to a human session — replace it.

```bash
PORT="${PROSPECTOR_PORT:-8092}"
STATUS="$(curl -s "http://127.0.0.1:$PORT/api/status" 2>/dev/null)"
if [ -n "$STATUS" ] && ! printf '%s' "$STATUS" | grep -q '"standalone"'; then
  echo "stale pre-standalone bridge on $PORT — replacing it"
  pkill -f "bridge/server.mjs"; pkill -f "scripts/loop.mjs"; pkill -f "scripts/agent-runner.mjs"; sleep 1; STATUS=""
fi
if [ -z "$STATUS" ]; then
  ( cd "$PLUGIN" && PROSPECTOR_PORT="$PORT" PROSPECTOR_LOG=/tmp/prospector-loop.log \
      nohup node bridge/server.mjs >/tmp/prospector-bridge.log 2>&1 & )
  sleep 1
fi
URL="http://127.0.0.1:$PORT/"
echo "▸ Prospector dashboard → $URL"
xdg-open "$URL" >/dev/null 2>&1 || true   # best-effort open
```

Tell the user the URL, that it runs in the background, and how to stop it — killing the bridge stops its
worker children too: `pkill -f "bridge/server.mjs"` (add `; pkill -f scripts/loop.mjs; pkill -f
scripts/agent-runner.mjs` only to clean strays).

## 2 · The watch-loop

The bridge spawns `scripts/loop.mjs`, which watches `requests/queue.jsonl` and runs the matching action
script (`discover`/`audit`/`rank`/`outreach`/`scope`/`delete`), appending an outcome to `results.jsonl`.
It is append-only + id-keyed (races safely with clicks) and **single-instance** (a `requests/loop.lock`
guard stops a second loop double-processing). Tail it to narrate progress:

```bash
tail -n 20 /tmp/prospector-loop.log
```

To drain the queue once without a standing loop (e.g. you're babysitting it yourself):
`PROSPECTOR_ROOT="$PROSPECTOR_ROOT" node "$PLUGIN/scripts/loop.mjs" --once`.

The bridge also spawns `scripts/agent-runner.mjs`, which drains the **agent actions** (`hunt`,
`deepdive`) by spawning a headless `claude` per request (model `PROSPECTOR_CLAUDE_MODEL`, default
`opus`; curated tool allowlist, or `PROSPECTOR_CLAUDE_BYPASS=1` to skip permission checks). This is
what makes the app standalone — the dashboard's 🎯 Find clients and ★ Deep-dive buttons now complete
on their own, no human-run skill needed. Its results land in `results.jsonl` like any other action.

## 2.5 · Supervise (optional — when you ARE the agent)

In standalone mode the agent-runner handles hunt/deep-dive for you. If instead you're driving the
dashboard from inside a Claude session (or want to do the judgement steps yourself), these are the
parts that need a vision/judgement-capable agent — check for them after actions run:

- **Taste grading** — after an `audit`, the captured sites sit at `taste:{pending}`. Run
  `node "$PLUGIN/scripts/pending.mjs"`, **Read** each item's screenshots, grade them, and persist with
  `scripts/grade.mjs`, then `scripts/rank.mjs` (see the `prospect-audit` skill for the rubric + commands).
- **Agent-research discovery** — a queued `discover` with `payload.source:"agent"` is for you: use
  WebSearch/WebFetch to find companies and write them via `prospect-discover`'s agent path.

While supervising, tail `/tmp/prospector-loop.log` to narrate progress, and re-run `pending.mjs`
after each capture batch so nothing waits ungraded.

## 3 · Notes

- **Activity console** (the ▤ Activity button) shows the live agent/loop: the running action, the
  queue, recent results (with timing), and a tail of the loop log. The bridge tails `$PROSPECTOR_LOG`
  (default `/tmp/prospector-loop.log`, where §1 writes the loop) — keep the two paths aligned.
- **Delete selected** removes the chosen companies + their audits + screenshots (gated by a confirm).
- The Discover dialog takes a **target count** (how many companies to add); discovery caps additions to it.
- Each action is also a standalone skill (`prospect-discover`, `prospect-audit`, `prospect-rank`,
  `prospect-outreach`, `prospect-scope`) you can invoke directly without the dashboard.
- **Stub phase:** discover/audit produce realistic placeholder data; `score` is real math. Replacing a
  stub later means swapping the script body in `scripts/<action>.mjs` — the request contract stays.
- Point at a different dataset with `PROSPECTOR_ROOT=/path/to/store`; serve on another port with
  `PROSPECTOR_PORT=NNNN`.
