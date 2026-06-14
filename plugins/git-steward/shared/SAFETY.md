# SAFETY — gates and backups for mutating operations

Every `apply`-mode operation honors this model. The goal: no irreversible action without an explicit,
informed confirmation, and always a way back. Skills reference this file from their apply sections.

## Default dry-run

`apply.sh` scripts first **print the exact plan** (what will change, in which repo) and exit without
mutating unless confirmation has been granted. The plan is the same artifact analyze mode produces, so
the user sees precisely what apply will act on.

## Confirmation gates, tiered by blast radius

| Tier | Actions | Gate |
|---|---|---|
| **1 — local, recoverable** | delete local branch, write/update a file, reword an un-pushed commit, add/remove a worktree | one confirmation listing the items |
| **2 — remote or irreversible** | delete remote branch, `push` / `push --force`, history rewrite, tag a release, bump deps & push | **second** confirmation that names the repo and the irreversible action explicitly |

For Tier 2, present the confirmation in plain terms: which repo, which action, why it can't be undone,
and (for rewrites) the restore command. Proceed only on an explicit yes.

## Backups before history rewrite

Before any history rewrite (`git-history-surgery` apply), **always**:

1. Create a timestamped backup ref: `git update-ref refs/git-steward/backup/<ts> HEAD`.
2. Make a full mirror clone into `.git-steward-backups/<repo>-<ts>.git` (gitignored).
3. Print the restore command so recovery is one copy-paste away.

Force-push after a rewrite is a **separate, third** opt-in step, never bundled into the rewrite itself.

## Never-touch list

Refuse to mutate, even in apply mode, unless the user explicitly forces it:

- the repository's **default branch** (resolve via `FORGE.md`) and the **current branch**;
- any branch/tree with **uncommitted or unpushed work**;
- protected branches (where the forge reports protection);
- CI / secret / credential files (`*.yml` CI configs, `.env`, `*.pem`, etc.) — these are
  security-sensitive; stop and ask rather than rewrite them automatically.

## Forge-merge verification before branch deletion

Before deleting a branch labeled "merged", confirm it really is merged: prefer the forge
(`glab`/`gh` says its MR/PR is merged) and fall back to git (`git branch --merged`, `git cherry`). When
neither can confirm, treat the branch as **not** safe to delete and report it instead.

## Fleet-level gate

For `fleet-steward` apply runs, in addition to each repo's own gates, present a **single top-level
confirmation** listing every affected repo and the actions queued, before any per-repo work starts.
Excluded repos (per `.git-steward/fleet.json`) are never touched.
