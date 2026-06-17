# pipeline-sentinel — continuous monitoring modes

"Monitor every repo and every pipeline" can mean three different things depending on how long you want
the watch to live. The sentinel supports all three; the user picks. `scripts/watch.sh` prints the exact,
filled-in invocation for each.

## 1. One-shot sweep (default)

A single fleet pass: enumerate every pipeline, diagnose failures, decide, report. This is what running
the skill plainly does. Use it to get a snapshot or before promoting a cause to `auto`.

## 2. In-session `/loop`

Re-sweep on an interval **while the session is open**; stops when the session closes. No infra, nothing
persisted. Good for babysitting a release window.

```
/loop 15m re-run the pipeline-sentinel sweep and execute any auto-policy fixes
```

The skill itself doesn't start the loop — it tells the user this command (or, when asked to "keep
watching," invokes the `loop` skill). Each tick is a full sweep + execution of `auto` items only;
`gated` items accumulate in the report for the user.

## 3. Scheduled cloud cron (always-on)

A scheduled cloud agent runs the sweep on a cron, independent of any session — true always-on
monitoring. Install via the `schedule` skill (or `CronCreate`) using the `cron_expr` and `agent_prompt`
that `watch.sh` emits, e.g. every 15 minutes:

```
*/15 * * * *
```

Agent prompt (auto-only, never the default branch):

> Run a pipeline-sentinel fleet sweep. Auto-fix only causes whose policy is "auto" (never the default
> branch); for everything else, post the report. If nothing is failing, do nothing.

**Recommendation:** keep the cron agent on the `auto` allowlist only — unattended runs should never hit
a gate they can't answer. Promote a cause to `auto` (in the policy file) only once you trust the
sentinel on that class. Gated and escalated items wait for an interactive session.

## Cost & loop guards (all modes)

- Each sweep bounds API calls: `--deep-max` caps how many failing pipelines per repo get full log pulls
  (default 10).
- The fix loop carries `pipeline-health`'s guards: `max_attempts` cap + **failure-signature dedup**
  (same cause + same failing jobs twice → stop) + per-attempt poll timeout.
- `infra`/quota causes are escalated, never retried as code fixes.
- Excluded repos/branches and the default branch are never pushed.
