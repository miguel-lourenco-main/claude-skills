# branch-cleanup/v1 — categories and schema

## Categories

| Category | Definition | Delete flag | Risk |
|---|---|---|---|
| `merged` | Fully merged into the default branch (`git branch --merged <default>`) | `git branch -d` (safe) | low |
| `gone` | Tracking branch whose upstream was deleted on the remote (`upstream:track` = `[gone]`) | `git branch -D` | low–med |
| `stale` | Not merged/gone, and no commit in `stale_days` (default 90) | `git branch -D` | medium (may hold unmerged work) |
| `keep` | Default branch, current branch, or active & unmerged | never deleted | — |

Checks are evaluated in order: protected (default/current) → merged → gone → stale → keep. The first
match wins, so a stale-but-merged branch is reported as `merged`.

## Schema

```json
{
  "schema": "branch-cleanup/v1",
  "name": "edgenchat",
  "repo": "../edgenchat",
  "default_branch": "main",
  "current_branch": "main",
  "remote": "origin",
  "stale_days": 90,
  "candidates": [
    { "branch": "feature/done", "sha": "abc1234", "category": "merged",
      "reason": "fully merged into main", "upstream_track": "", "recoverable": true }
  ],
  "summary": { "merged": 1, "gone": 0, "stale": 0, "keep": 3 },
  "remote_prunable": ["origin/old-feature"]
}
```

`remote_prunable` comes from `git remote prune <remote> --dry-run` — stale remote-tracking refs that can
be cleaned up locally with `--prune` (this does not delete anything on the server).

## Apply result (`branch-cleanup-result/v1`)

```json
{ "schema": "branch-cleanup-result/v1",
  "deleted_local": ["chore/old", "feature/done"],
  "deleted_remote": [],
  "failed": [] }
```
