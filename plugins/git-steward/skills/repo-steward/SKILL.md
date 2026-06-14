---
name: repo-steward
description: This skill should be used when the user wants to steward, audit, or clean up ONE repository as a whole — e.g. "give this repo a full checkup", "clean up this repo's git", "audit everything in this repo", "tidy up <repo>", "what needs attention in this repo", or "do a full sweep of this repo". It stacks the atomic git-steward skills (health, branch cleanup, commit hygiene, history surgery, work-items, CI) into one report (analyze) or one gated cleanup pass (apply). Add "--optimize"/"full sweep" to include the optimize-tier skills.
version: 0.1.0
---

# repo-steward (Tier 2)

Run the atomic git-steward skills together on a single repository and present one combined result.
In analyze mode this is one report; in apply mode it is one gated cleanup pass that runs each atomic
skill's `apply.sh` in a safe order behind its own confirmation gate.

## Scope selection (mode + optimize, see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- Infer **mode** (analyze default / apply) from the prompt.
- Infer **`--optimize`**: off by default (core skills only); on when the prompt says "optimize / full
  sweep / deep clean / also tidy everything / the works".

## Analyze

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/repo-steward/scripts/run_repo.sh --repo <path> [--optimize] [--only a,b]
```
Runs each in-scope atomic `analyze.sh` and emits `repo-steward/v1`: the full per-skill output under
`skills`, plus an `attention` roll-up (health flags, prunable branches, non-conventional commits, secret
findings, big blobs, open work items, CI status).

**A detailed findings document is generated automatically** (unless `--no-report`) and its path is
returned as `report_path`. The document (built by `${CLAUDE_PLUGIN_ROOT}/shared/report.sh`, saved under
`<repo>/.git-steward/reports/`) has an at-a-glance table, per-dimension detail (every prunable branch,
each secret with file/line, non-conventional subjects, ranked work items, failing CI jobs), and a
**prioritized "Recommended next steps"** decision aid giving the exact gated command for each finding.
After analyzing, present the attention summary, give the user the `report_path`, and surface the top
recommended steps so they can make an informed decision before anything is applied.

Core skills always run: `git-repo-health`, `git-branch-cleanup`, `commit-hygiene`, `git-history-surgery`,
`work-items`, `pipeline-health`. With `--optimize`, the optimize-tier skills (if present) also run.

## Execute from an edited report (the decision aid)

The findings document ends with an **Actions** checklist of machine-tagged checkboxes — one per specific
item (each branch, each file, each commit, each work item). This is the primary, precise way to apply:
the user edits the document to choose exactly what to do.

1. After analyze, tell the user the `report_path` and that they can **check the boxes** for what they
   want (`- [x]` = do, `- [ ]` = skip), edit reword messages after the `→`, and leave the `<!--gs ...-->`
   tags intact.
2. When the user says "execute the checked actions", run:
   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/shared/run-plan.sh --report <report.md>      # add --dry-run to preview
   ```
   It parses the checked items (`${CLAUDE_PLUGIN_ROOT}/shared/parse-actions.sh` → `execution-plan/v1`),
   then runs **Tier-1** actions (local/recoverable — branch deletes, rewords, `.gitignore`, untrack,
   worktree prune, dep bumps) with `--confirm` (the checkbox is the confirmation). **Tier-2** actions
   (🔴 history rewrite, remote deletes, work-item starts, CI pushes, release tags) are **not** auto-run —
   it prints the exact gated command for each so they're executed deliberately.
3. Carry out the listed Tier-2 commands only on explicit user confirmation (history rewrite still needs
   `--i-understand <repo-name>` and takes a backup first).

This per-item path is preferred when the user wants control. The whole-pass apply below is the
"just clean it all up" alternative.

## Apply (orchestrated, gated)

Apply mode is driven here in the model layer — call each atomic skill's `apply.sh` in this **safe
order**, honoring each one's gate (`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`). Stop and surface anything
that refuses.

1. `git-repo-health` — read-only; use its flags to decide what to do.
2. `git-branch-cleanup` — prune merged/gone (offer stale); local first, remote = 2nd gate.
3. `commit-hygiene` — reword un-pushed commits only.
4. `work-items` — optionally start the top item (branch + draft MR/PR).
5. `pipeline-health` — if CI is failing, run the fix→monitor loop.
6. `git-history-surgery` — **last**, most dangerous; only on explicit request, with backup + Tier-2 gate.
7. (optimize-tier, only if `--optimize`) — after core, in the same gated manner.

Present a single consolidated plan before applying, confirm once at the top, then proceed skill by skill
with each skill's own gate still in force. Never bypass an atomic skill's confirmation.

## Relationship to the fleet

`fleet-steward` calls this skill across many repos. Keep `run_repo.sh` output stable — it is the unit
the fleet aggregates.

## Additional resources

- **`${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`** — mode + optimize inference.
- **`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`** — the gates each apply step must honor.
