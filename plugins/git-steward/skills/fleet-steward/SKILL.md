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
   - `workspace` — local `.git` repos under the root (`$GS_ROOT`, default `~/Desktop/personal/projects`; or pass `--root`).
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

**One consolidated, self-explaining document is generated** (no per-repo files, no separate index): the
`fleet_report` path under `<root>/.git-steward/reports/<stamp>-fleet.md`. The script writes the structure
and raw data: a one-time **How to use this report**, fleet totals, a severity table, a top **Cross-repo
themes** region, then per repo a findings section (health/blobs, branches, commits, secrets, per-branch
CI) with an **Actions** list where every item already carries *Why / Risk / Source*, plus a per-repo
**Analysis & tasks** agent region — and a **Glossary** at the end. Present the fleet totals, then point
the user at the single `fleet_report`.

## Step 2.5 — Annotate the report (fill the agent regions)

The script leaves judgement that needs investigation to you. **Edit the single report**, filling each
delimited region. Scope the deep work to **notable** findings (secrets, over-threshold blobs, failing
CI, active branches, work items); mechanical actions already explain themselves, so don't re-explain them.

**Markdown rule (applies everywhere you write):** always put a **blank line before a bulleted list**, or
it won't render as bullets. Keep every list as real `-` bullets; nest sub-bullets with two spaces.

1. **Per-repo `<!-- gs:repo:<name>-start/end -->` regions** — for each repo:
   - **Explain notable findings with sources (deep).**
     - *Secrets:* investigate (`git -C <repo> log -S '<snippet>' --oneline`, `git blame`, read the
       `file:line`) to decide real-vs-false-positive. **Don't enumerate false positives** — mention them
       in **one casual aggregate line** (e.g. *"the N matches are all false positives — env interpolation /
       i18n / test fixtures"*). The **script does not auto-propose history removal** for raw working-tree
       matches (so false positives never become actions); only a **real** secret gets a detailed finding
       **and** an action that **you** author here — tell the user to rotate the credential, and add the
       parseable Tier-2 checkbox:
       ```

       - [ ] 🔴 **Remove `<file>` from ALL history** <!--gs op=history-remove-path repo=<name> path=<file>-->
         - *Why:* purge the confirmed secret `<file>` from every commit.
         - *Risk:* 🔴 Tier 2 · IRREVERSIBLE (history rewrite; backup first). **Rotate the credential** — rewriting does not un-leak it.
         - *Source:* <commit/blame evidence that the value is a real secret>.
       ```
     - *Blobs:* judge cleanability — `in_worktree` + build-artifact/gitignored → removable (untrack now,
       or history rewrite if history-only); a real committed asset → keep.
     - *CI:* the report already prints each failing pipeline's cause **and a diagnosis trail** (what was
       checked + the result, incl. GitLab `failure_reason`). Summarize it; if the cause is still
       `unknown`/`empty-pipeline`, dig one level further (read the branch's `.gitlab-ci.yml`
       `workflow:`/`rules:`) and report what you found.
   - **Assess active / unmerged branches (merge-vs-variant).** For each branch listed as active/unmerged
     (`ahead>0`): look at `git -C <repo> log <default>..<branch> --oneline`, the branch name, and any open
     MR. If it holds finished, sensible work, propose a merge task
     `- [ ] **Merge `<branch>` into `<default>`** <!--gs op=branch-merge repo=<name> branch=<branch>-->`
     with *Why/How*. If it's a deliberate **variant** (`variant/`, `experiment/`, a permanent alt-version,
     or large intentional divergence) or stale/abandoned, **say so and do not propose a merge**.
   - **Validate, then group work items into tasks.** Before writing a task, **check whether each item is
     already implemented or no longer valid**: search branches and recent commits
     (`git -C <repo> log --oneline --all --grep '<keyword>'`, `git log -S`), locate where it would live in
     the code, and read that code. If already done, mark it **done/likely-done with evidence** instead of
     proposing it; if partially done, scope the task to the remainder. Then merge related items and write
     each task **across multiple lines** (blank line before the list):
     ```

     - [ ] **<task title>** <!--gs op=work-item-implement repo=<name> numbers=<n,m> slug=<kebab>-->
       - *Items:* #<n>, #<m>
       - *Why:* <why these belong together / the goal / validity note>
       - *How:* <concrete steps grounded in the code you read — name the files/components and the approach, not a vague restatement>
     ```
     `numbers` lists every item the task subsumes (comma-joined, no spaces); `slug` is a kebab branch name.
     Group, don't transcribe — fewer, better-scoped, validated tasks. When the Tasks list has 2+ items,
     **end it with** `- [ ] _**Select all of the above**_ <!--gs op=select-all-->` so the user can queue
     them all (then exclude individual ones by ticking).
2. **Top `<!-- gs:themes-start/end -->` region** — groups of related items spanning more than one repo;
   call out overlap/duplication so the same work isn't done twice. Per-repo tasks stay in their repo's
   region (linked by theme).

Base every explanation on evidence (file:line, commit, branch, CI cause, blob size + in-worktree,
work-item already-done check). When you cap deep investigation, say what you skipped.

## Step 3 — Execute the checked items

When the user has checked boxes (Actions and/or work-item tasks) and says to execute:
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
