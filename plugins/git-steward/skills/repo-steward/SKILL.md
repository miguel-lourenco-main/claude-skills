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

**A detailed, self-explaining findings document is generated automatically** (unless `--no-report`) and
its path is returned as `report_path`. The document (built by `${CLAUDE_PLUGIN_ROOT}/shared/report.sh`,
saved under `<repo>/.git-steward/reports/`) has a one-time **How to use** guide, an at-a-glance table, an
**Analysis & tasks** agent region, per-dimension detail (health/blobs, every prunable branch, each secret
with file/line, non-conventional subjects, per-branch CI), an **Actions** list where each item carries
*Why / Risk / Source*, and a **Glossary**. After analyzing, fill the agent region (below), present the
attention summary, and give the user the `report_path`.

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

**Annotate the report's `<!-- gs:repo:<name>-start/end -->` region** before handing it over. **Markdown
rule: always put a blank line before a bulleted list** or it won't render. Explain the repo's notable
findings with sources (deep): trace each working-tree secret with `git log -S`/`git blame` to judge
real-vs-false-positive — but **don't enumerate false positives**, mention them in one casual aggregate
line; only a **real** secret gets detail + an action. Assess each over-threshold blob's cleanability
(`in_worktree` + artifact → removable; real asset → keep) and summarize any failing CI cause. For each
**active/unmerged branch** (`ahead>0`), check `git log <default>..<branch>` + the name: propose a merge
task `<!--gs op=branch-merge repo=<name> branch=<branch>-->` if it's finished sensible work, or flag it as
a deliberate variant and don't. Then **validate** each open work item against branches/recent commits/the
relevant code (`git log --all --grep`, `git log -S`, read where it'd live) — if already implemented, mark
it done with evidence; otherwise group/dedupe into a few well-scoped tasks, each written **across multiple
lines** (blank line before the list): a checkbox **title** line carrying the tag, then `*Items:*` /
`*Why:*` / `*How:*` sub-bullets where **How is concrete and grounded in the code you read** (files,
components, steps):
```

- [ ] **<task title>** <!--gs op=work-item-implement repo=<name> numbers=<n,m> slug=<kebab>-->
  - *Items:* #<n>, #<m>
  - *Why:* <why grouped / validity note>
  - *How:* <concrete steps — which files/components, the approach>
- [ ] _**Select all of the above**_ <!--gs op=select-all-->
```
(end a 2+-item Tasks list with that select-all line; per-repo layer only; no cross-repo themes for a single repo). Such a task
is an **agent task**, not a script action: `run-plan.sh` surfaces it under Tier-2 and you implement it
yourself — create the `slug` branch, write the change, commit, push, and open the MR via `glab` — behind
the Tier-2 gate. (`op=work-item-start` remains the lightweight "just open a branch + draft" alternative.)

This per-item path is preferred when the user wants control. The whole-pass apply below is the
"just clean it all up" alternative.

## Apply (orchestrated, gated)

Apply mode is driven here in the model layer — call each atomic skill's `apply.sh` in this **safe
order**, honoring each one's gate (`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`). Stop and surface anything
that refuses.

1. `git-repo-health` — read-only; use its flags to decide what to do.
2. `git-branch-cleanup` — prune merged/gone (offer stale); local first, remote = 2nd gate.
3. `commit-hygiene` — reword un-pushed commits only.
4. `work-items` — optionally start the top item (branch + draft MR/PR), or **implement** a selected
   item/task end-to-end (branch → change → commit → push → open MR) on explicit request.
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
