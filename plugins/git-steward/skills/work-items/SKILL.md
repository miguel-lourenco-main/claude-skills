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

### Before implementing: check the plan against the item

A task is the agent's reading of a work item, and that reading can drift: several items folded into
one, a vague issue filled in with guesses, a "How" written before the code was read. The Tier-2 gate
confirms the *repo*; it does not confirm that the plan is what the item asked for. So before writing
code for a `work-item-implement` task (or any item picked up in apply mode), write the plan down and
compare it with the item text:

- **Item says** — the requirement in the item's own words, with its acceptance criteria if it has any.
- **I will change** — files and behaviour, concretely.
- **Not doing / assuming** — the parts of the item left out, and every gap filled with a guess.

**Stop and show that plan to the user, and wait for a yes,** when any of these is true:

1. The plan does not map one-to-one onto the item: scope added, part of the item dropped, or a
   different approach from the one the item names.
2. The item is vague, has no acceptance criteria, or reads as a proposal or discussion ("let's
   consider…", 🤔 needs-refinement), so the plan rests on assumptions.
3. The task groups several items, or the code you read contradicts the item's premise (already
   done, different cause, the file it names is gone).
4. The change touches something hard to take back or easy to get wrong unseen: security, auth or
   secrets; data, migrations or schemas; a public API or file format; CI configuration; deleting
   files or behaviour; anything in the never-touch list of `${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`.
5. It is large: more than a handful of files, or not revertable as one commit.

Otherwise (small, well specified, the plan matches the item's wording, one revert undoes it), go
ahead, and put the same three-part plan in the MR description so the reviewer can check the mapping.
When in doubt, ask: one question costs less than a review of the wrong change.

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
