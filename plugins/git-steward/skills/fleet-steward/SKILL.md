---
name: fleet-steward
description: This skill should be used when the user wants to steward MANY repositories at once — e.g. "clean up all my repos", "audit every project", "git health across all my repos", "fleet checkup", "run this across everything", "tidy up all my projects", or "which of my repos need attention". It discovers/loads the repo fleet, runs repo-steward across it (read-only fan-out, or one sub-agent per repo for mutations), and aggregates a cross-repo report. Add "--optimize"/"full sweep" to include the optimize-tier skills.
version: 0.1.0
---

# fleet-steward (Tier 3)

Steward many repositories at once. Resolve which repos are in the fleet, run `repo-steward` across them,
and aggregate one cross-repo report. Read-only runs fan out cheaply via a script loop; mutating runs
dispatch one sub-agent per repo for isolation, behind a single top-level confirmation gate.

## Step 1 — Fleet scope gate (do this BEFORE any work, when no saved fleet exists)

Ask the user which repo source to manage, then let them exclude repos. Never assume.

1. **Choose the source** (`scripts/resolve_fleet.sh --source <choice>`):
   - `workspace` — local `.git` repos under the root (default `/home/migaloco/Desktop/personal/projects`).
   - `gitlab` — all projects in the authenticated GitLab account (`scripts/list_gitlab_projects.sh`).
   - `both` — the **intersection** (repos in both, matched by project slug).

   Surface the caveat: local-mutating skills (branch cleanup, history surgery, health) need a local
   clone, so **GitLab-account-only repos that aren't cloned can't be locally mutated** — for those, limit
   to remote-capable skills (work-items, pipeline-health) or offer to clone first. **Intersection is the
   safe default for mutating fleet runs.**

2. **Exclude repos**: present the resolved candidate list and let the user deselect any. Persist with
   `--save` to `<root>/.git-steward/fleet.json` so later runs reuse it (`--load`); re-open the gate on
   request (re-run with a new `--source`/`--exclude`). Excluded repos are never touched.

```bash
# resolve + save the fleet (run once, or when re-selecting):
bash ${CLAUDE_PLUGIN_ROOT}/skills/fleet-steward/scripts/resolve_fleet.sh \
  --source workspace --exclude ComfyUI,old-thing --save
```

## Step 2 — Run across the fleet

### Read-only (analyze) — cheap script fan-out
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/fleet-steward/scripts/run_across.sh [--optimize]
```
Loops `repo-steward` analyze over the saved fleet (falls back to workspace discovery) and emits
`fleet-steward/v1`: each repo's full `repo-steward/v1` object (skills + `attention`) plus `totals`
(repos with secrets, prunable branches, failing CI, open work items).

**One consolidated findings document is generated** (no per-repo files, no separate index): the
`fleet_report` path under `<root>/.git-steward/reports/<stamp>-fleet.md`. It holds the fleet totals, a
severity-sorted table, a **Work Items — Task Plan** region (for Step 2.5), then a full findings +
Actions section per repo (every prunable branch, each secret, ranked items, failing CI) with intact
`<!--gs ...-->` tags. Present the fleet totals, then point the user at the single `fleet_report`.

## Step 2.5 — Synthesize the work-item task plan into the report

After `run_across.sh`, take **all** work items across the fleet as a whole and turn them into a grouped,
deduped task plan — then **edit the single report**, replacing the region between
`<!-- gs:task-plan-start -->` and `<!-- gs:task-plan-end -->` with it. Source data: each repo's
`skills["work-items"].items` in the `fleet-steward/v1` JSON (also listed raw inside that region).

Produce two layers:
- **`### Cross-repo themes`** — groups of related items spanning more than one repo; call out overlap and
  duplicates so the same work isn't done twice.
- **`### Per-repo task groups`** — within each repo, merge related items into a single task and collapse
  duplicates. Make each actionable task a checkbox carrying a tag:
  `- [ ] <task> <!--gs op=work-item-implement repo=<name> numbers=<n,m> slug=<kebab>-->`
  where `numbers` lists every work-item number the task subsumes (comma-joined, no spaces) and `slug` is
  a kebab branch name. Group, don't just transcribe — the value is fewer, better-scoped tasks.

## Step 3 — Execute the checked items

When the user has checked boxes (Actions and/or task-plan tasks) and says to execute:
```bash
bash ${CLAUDE_PLUGIN_ROOT}/shared/run-plan.sh --report <fleet_report>   # add --dry-run to preview
```
Tier-1 mechanical git ops auto-run (their checkbox is the confirmation). Tier-2 items are printed, not
auto-run. For each surfaced **`work-item-implement`** directive, **perform it yourself** behind the
Tier-2 gate: confirm that repo, create the `slug` branch, implement the change, commit, push, and open
the merge request via `glab` (this account is GitLab). Do one repo at a time; stop and surface anything
that refuses or looks wrong before moving on.

### Mutating (apply) — one sub-agent per repo
For a cleanup pass across the fleet, **dispatch one sub-agent per included repo**, each instructed to run
`repo-steward` in apply mode on that single repo (with `--optimize` if requested). This isolates failures
(one repo's error doesn't abort the rest) and keeps each repo's confirmation context separate. Before any
sub-agent starts, present a **single top-level confirmation** listing every affected repo and the queued
actions (`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md` fleet-level gate). Each repo's per-skill gates still
apply inside its sub-agent. Aggregate the sub-agents' structured results into the same fleet report shape.

## Optimize tier

Default fleet runs use core skills only. With `--optimize` (or "full sweep / deep clean"), the
optimize-tier skills also run per repo. See `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`.

## Additional resources

- **`scripts/discover_repos.sh`** — workspace repo discovery + forge classification.
- **`scripts/list_gitlab_projects.sh`** — GitLab account projects (needs `glab` auth).
- **`scripts/resolve_fleet.sh`** — source choice + intersection + exclusions, persisted to `fleet.json`.
- **`scripts/run_across.sh`** — read-only fan-out aggregator.
- **`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`** — the fleet-level confirmation gate.
