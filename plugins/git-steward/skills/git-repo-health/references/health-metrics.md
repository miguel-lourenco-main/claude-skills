# repo-health/v1 — schema and computation

The `analyze.sh` script emits one JSON object per repo. All values come from pure git commands; no
network or forge CLI is used.

## Schema

```json
{
  "schema": "repo-health/v1",
  "name": "edgenchat",
  "repo": "../edgenchat",
  "current_branch": "main",
  "default_branch": "main",
  "worktree":  { "dirty": 0, "untracked": 0 },
  "sync":      { "upstream": "origin/main", "ahead": 0, "behind": 0 },
  "branches":  { "local": 2, "remote": 4, "merged_into_default": 0, "stale": 1, "stale_days": 90 },
  "activity":  { "days_since_last_commit": 6, "commits_last_90d": 13, "total_commits": 29, "contributors": 2 },
  "largest_blobs": [ { "path": "...", "mb": 46.19 } ],
  "flags": [ "stale-branches>90d" ]
}
```

On error the object is `{ "schema": "repo-health/v1", "repo": "...", "error": "<reason>" }` — callers
should skip it and surface the reason.

## How each metric is computed

| Field | Source |
|---|---|
| `default_branch` | `refs/remotes/<remote>/HEAD`, else `main`/`master` if present |
| `worktree.dirty` | `git status --porcelain` line count |
| `worktree.untracked` | `git ls-files --others --exclude-standard` count |
| `sync.ahead`/`behind` | `git rev-list --left-right --count @{upstream}...HEAD` |
| `branches.local`/`remote` | `git for-each-ref refs/heads` / `refs/remotes` (excluding HEAD) |
| `branches.merged_into_default` | `git branch --merged <default>` minus default/current |
| `branches.stale` | local branches whose `committerdate` is older than `stale_days` |
| `activity.days_since_last_commit` | now − `git log -1 --format=%ct`; `-1` if no commits |
| `activity.commits_last_90d` | `git log --since='90 days ago'` count |
| `activity.total_commits` | `git rev-list --count --all` |
| `activity.contributors` | `git shortlog -sn --all` line count |
| `largest_blobs` | top 3 blobs by size across all history (`rev-list --objects` + `cat-file`) |

## Flags

Advisory only — each names a condition, never an action:

- `uncommitted-changes` — dirty working tree
- `unpushed-commits` — ahead of upstream
- `behind-upstream` — behind upstream
- `merged-branches-prunable` — ≥1 branch merged into default
- `stale-branches>Nd` — ≥1 local branch with no commit in `stale_days`
- `repo-dormant>180d` — no commit in over 180 days
