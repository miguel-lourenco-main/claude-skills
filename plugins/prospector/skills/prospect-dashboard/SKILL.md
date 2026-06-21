---
name: prospect-dashboard
description: Open the Prospector dashboard — a local HTML console to view discovered companies, their website audits and lead scores, and to trigger the prospecting actions (discover, audit, score, outreach, edit scope). Use when the user says "open/run/launch the prospector dashboard", "show me my leads", "open prospector", or wants to view/triage the company pipeline in the browser. Starts a local bridge + a watch-loop so the dashboard's buttons execute live.
---

# Prospector dashboard

Serves the Prospector console and starts the **watch-loop** that turns the dashboard's button
clicks into real work. Architecture: the browser only reads the store and enqueues actions; a
background loop drains the queue by running the action scripts and mutating the filesystem store,
which the page re-reads every ~2s.

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

## 1 · Serve + start the watch-loop + open

Start the bridge and the loop in the **background**, then report the link and open it:

```bash
PORT="${PROSPECTOR_PORT:-8092}"
# already running? just report the URL (don't double-start)
if ! curl -s "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then
  ( cd "$PLUGIN" && PROSPECTOR_PORT="$PORT" nohup node bridge/server.mjs >/tmp/prospector-bridge.log 2>&1 & )
  ( cd "$PLUGIN" && nohup node scripts/loop.mjs >/tmp/prospector-loop.log 2>&1 & )
  sleep 1
fi
URL="http://127.0.0.1:$PORT/"
echo "▸ Prospector dashboard → $URL"
xdg-open "$URL" >/dev/null 2>&1 || true   # best-effort open
```

Tell the user the URL, that the bridge + loop run in the background, and how to stop them:
`pkill -f "bridge/server.mjs"; pkill -f "scripts/loop.mjs"`.

## 2 · The watch-loop

`scripts/loop.mjs` watches `requests/queue.jsonl` and, for each new request, runs the matching action
script (`discover`/`audit`/`score`/`outreach`/`scope`), appending an outcome to `results.jsonl`. It is
append-only and id-keyed, so it races safely with the bridge enqueuing clicks. Tail it to narrate
progress for the user:

```bash
tail -n 20 /tmp/prospector-loop.log
```

To drain the queue once without a standing loop (e.g. you're babysitting it yourself):
`PROSPECTOR_ROOT="$PROSPECTOR_ROOT" node "$PLUGIN/scripts/loop.mjs" --once`.

## 3 · Notes

- Each action is also a standalone skill (`prospect-discover`, `prospect-audit`, `prospect-score`,
  `prospect-outreach`, `prospect-scope`) you can invoke directly without the dashboard.
- **Stub phase:** discover/audit produce realistic placeholder data; `score` is real math. Replacing a
  stub later means swapping the script body in `scripts/<action>.mjs` — the request contract stays.
- Point at a different dataset with `PROSPECTOR_ROOT=/path/to/store`; serve on another port with
  `PROSPECTOR_PORT=NNNN`.
