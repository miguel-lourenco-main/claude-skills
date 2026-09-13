---
name: git-branch-cleanup
description: This skill should be used when the user asks to "clean up branches", "prune merged branches", "delete stale/old branches", "remove gone branches", "tidy up my branches", "which branches can I delete", "show stale branches", or wants to audit or remove merged, stale, or upstream-gone branches locally and on the remote. Defaults to read-only analysis; deletion happens only in apply mode behind a confirmation gate.
version: 0.1.0
model: sonnet
---

# git-branch-cleanup

Classify a repo's local branches into **merged** (fully merged into the default branch), **gone**
(upstream tracking branch deleted on the remote), **stale** (no commit in N days), or **keep**, then —
in apply mode and only after confirmation — delete the prunable ones locally and optionally on the
remote. The default and current branches are never deleted.

`class: core` — runs on every `repo-steward` / `fleet-steward` pass.

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): classify branches and report candidates. No deletions. Trigger on "show/list/
  which/audit stale branches".
- **apply**: delete the selected categories. Trigger on "clean up/prune/delete/remove branches".
  Always governed by `${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`. When ambiguous, analyze.

## How to use

### Analyze
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-branch-cleanup/scripts/analyze.sh --repo <path> [--stale-days 90]
```
Emits `branch-cleanup/v1` JSON: every branch with its `category` and `reason`, a `summary` count, and
`remote_prunable` (stale remote-tracking refs). Present the candidates grouped by category and ask which
to remove. Default `stale-days` is 90.

### Apply (gated)
The apply script re-runs the classification itself, so pass the same options. **Without `--confirm` it
prints the plan and deletes nothing** — always show that dry-run to the user first.

```bash
# Tier 1 — delete selected LOCAL branches (recoverable via reflog):
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-branch-cleanup/scripts/apply.sh \
  --repo <path> --categories merged,gone[,stale] --confirm

# Optional extras:
#   --prune          also drop stale local remote-tracking refs (git remote prune)
#   --delete-remote  Tier 2 — also delete the matching branches on the remote (irreversible on server)
```

Workflow the skill follows:
1. Run analyze, present candidates by category.
2. Recommend categories: `merged` and `gone` are low-risk defaults; include `stale` only when the user
   wants it (stale branches are force-deleted with `-D`, recoverable via reflog).
3. Run apply **without** `--confirm` and show the plan.
4. Get explicit user confirmation. Only then re-run with `--confirm`.
5. For `--delete-remote` (Tier 2), confirm a **second** time, naming the remote — this removes server
   branches and cannot be undone from the reflog.

## Safety notes

- `merged` branches are deleted with `git branch -d` (refuses if not actually merged); `gone`/`stale`
  use `-D`. The script re-checks and skips the default and current branch even if selected.
- Merged-state is established from `git branch --merged <default>`. When a forge confirms an MR/PR is
  merged (`glab`/`gh`), that's stronger evidence — see `${CLAUDE_PLUGIN_ROOT}/shared/FORGE.md`.
- Deleted local branches are recoverable from the reflog until it expires; remote deletions are not.

## Additional resources

- **`references/categories.md`** — exact category definitions and the `branch-cleanup/v1` schema.
- **`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`** — confirmation gates and never-touch list.
