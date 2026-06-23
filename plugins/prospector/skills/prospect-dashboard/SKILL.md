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

## 1 · Serve + open

Start **only the bridge** — it owns and manages the watch-loop as a child, so there is exactly ONE
process to start and stop (no orphaned shells). If a bridge is already serving, reuse it.

```bash
PORT="${PROSPECTOR_PORT:-8092}"
if ! curl -s "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then
  ( cd "$PLUGIN" && PROSPECTOR_PORT="$PORT" PROSPECTOR_LOG=/tmp/prospector-loop.log \
      nohup node bridge/server.mjs >/tmp/prospector-bridge.log 2>&1 & )
  sleep 1
fi
URL="http://127.0.0.1:$PORT/"
echo "▸ Prospector dashboard → $URL"
xdg-open "$URL" >/dev/null 2>&1 || true   # best-effort open
```

Tell the user the URL, that it runs in the background, and how to stop it — killing the bridge stops its
loop child too: `pkill -f "bridge/server.mjs"` (add `; pkill -f scripts/loop.mjs` only to clean strays).

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

## 2.5 · Supervise (the agent's part of the loop)

The node loop runs the **mechanical** steps. Two steps need **you** (a vision/judgement-capable agent),
so check for them after actions run — that's what makes the dashboard's buttons fully "live":

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
