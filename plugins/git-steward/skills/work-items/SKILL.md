---
name: work-items
description: This skill should be used when the user asks to "triage my issues", "what should I work on", "review open issues/MRs/PRs", "classify the backlog", "plan my work items", "go through the issues", "rank my tickets", or "pick up the top task" for a GitLab or GitHub repo. It fetches issues and merge/pull requests, classifies them by importance and scope, and produces a ranked task plan. Defaults to read-only analysis; starting work (branch + draft MR/PR) happens only in apply mode behind a confirmation gate.
version: 0.1.0
---

# work-items

Fetch the open issues and merge/pull requests for a repo, classify each by **importance** and **scope**
using reproducible label-driven rules, and produce a ranked task plan. In apply mode, start the chosen
item by creating a branch and opening a draft MR/PR.

`class: core` — runs on every `repo-steward` / `fleet-steward` pass.

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): fetch, classify, rank, report. No changes. Trigger on "triage/what should I
  work on/review the backlog/classify".
- **apply** (execute): start the top (or named) item. Trigger on "start/pick up/begin the top one/
  draft an MR for #N". Gated (Tier 2 — pushes a branch, opens a draft). When ambiguous, analyze.
  **A new branch is not the default outcome** — see *Where the work goes* below.

## How to use

### Analyze
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/work-items/scripts/analyze.sh --repo <path> [--per-page 100]
```
The script resolves the forge via `${CLAUDE_PLUGIN_ROOT}/shared/resolve-host.sh`, fetches via `glab`
(GitLab) or `gh` (GitHub), normalizes issues and MRs/PRs into one model, and emits `work-items/v1` JSON
with each item's `importance`, `scope`, `age_days`, and `rank`. If the forge CLI is missing or
unauthenticated, it returns `{available:false, reason:...}` — report that and suggest the fix
(`glab auth login` / install `gh`).

Present a ranked table (rank, importance, scope, title, url) and a short "do these first, because…"
recommendation for the top few. Then optionally seed the agent's todo/plan with the top N via
`TaskCreate`.

### Where the work goes (before apply)

Starting an item does **not** imply a new branch. Read
`${CLAUDE_PLUGIN_ROOT}/skills/branch-scope/SKILL.md` first: a branch costs a pipeline per push and,
on a `rebase_merge` project, its own sequential merge cycle — when one MR lands, every other open
one flips to `need_rebase` and its pipeline is wasted. One branch may close several items.

So check what is already in flight and prefer adding a commit to it when the item shares a service,
a surface or a root cause:

```bash
git -C <repo> for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads --no-merged <default>
glab mr list -R <project>   # or gh pr list -R <repo>
```

Create a branch only when `branch-scope` says the work is separately reviewable and revertable.
When it is, name it for what it will carry in total rather than for the one item that started it,
and list every item it closes in the MR description.

### Apply (gated)
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/work-items/scripts/apply.sh \
  --repo <path> --start <number> --type <feat|fix|docs|…> --slug <kebab-summary> [--title "..."] --confirm
```
Without `--confirm`, it prints the plan and creates nothing. With `--confirm` it creates
`<type>/<number>-<slug>` from the default branch, pushes it, and opens a **draft** MR/PR linked to the
item. Confirm explicitly first — this is an outward action on the user's forge.

## Classification (reproducible)

Importance and scope come from labels, milestone, assignees, and age — not guesswork — so results are
stable across repos. See **`references/classification.md`** for the exact tier rules. Summary:

- **importance**: `critical` (security/blocker), `high` (bug/urgent, or assigned+milestoned, or aged
  bug), `medium` (milestoned or feature/enhancement), `low` (everything else).
- **scope**: `large` (epic/xl), `small` (good-first-issue/trivial/chore), else `medium`.
- **rank**: importance first, then smaller scope (quick wins), then older first.

The classifier only ingests deterministic signals; use the model layer to write the human rationale and
to refine a generic `low/medium` when the title or description clearly indicates otherwise.

## Additional resources

- **`${CLAUDE_PLUGIN_ROOT}/skills/branch-scope/SKILL.md`** — what belongs on one branch, and when
  an existing branch should take the work instead. Consulted before this skill creates anything.
- **`references/classification.md`** — full importance/scope tier tables and the `work-items/v1` schema.
- **`${CLAUDE_PLUGIN_ROOT}/shared/FORGE.md`** — GitLab/GitHub abstraction and degradation.
