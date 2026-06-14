---
name: worktree-manager
description: This skill should be used when the user asks to "list my worktrees", "clean up git worktrees", "prune worktrees", "remove a worktree", "add a worktree", or mentions stale/leftover `git worktree` directories. Analyze lists worktrees and flags prunable ones; apply prunes/removes/adds them. Optimize-tier — runs in a fleet/repo pass only with --optimize, or standalone on request.
version: 0.1.0
---

# worktree-manager

Manage git worktrees. Analyze lists every worktree with its branch/HEAD and flags prunable entries
(admin records whose directory is gone). Apply prunes stale entries, removes a worktree, or adds one.

`class: optimize` — included in `repo-steward`/`fleet-steward` only with `--optimize`; always usable on
its own.

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): list worktrees + prunable count. Read-only.
- **apply**: `--prune`, `--remove <path>`, or `--add <path> --branch <name>` (Tier 1, gated).

## Use

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/worktree-manager/scripts/analyze.sh --repo <path>
bash ${CLAUDE_PLUGIN_ROOT}/skills/worktree-manager/scripts/apply.sh --repo <path> --prune --confirm
bash ${CLAUDE_PLUGIN_ROOT}/skills/worktree-manager/scripts/apply.sh --repo <path> --remove <wt-path> --confirm
```
`analyze` emits `worktree-manager/v1`. `apply` without `--confirm` prints the plan. `--remove` uses a
safe `git worktree remove` (refuses if the worktree is dirty; force is a deliberate manual step).
