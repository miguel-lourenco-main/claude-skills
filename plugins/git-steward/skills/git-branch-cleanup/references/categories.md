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

### Reconciled view (run before analysis)

`shared/sync-remote.sh` runs once per repo before this analyzer (via `repo-steward/run_repo.sh`):
it does `git fetch --all --prune --tags` and, when safe (clean tree, default branch strictly behind),
fast-forwards the default branch. The `--prune` is what turns a branch whose remote was deleted into
`[gone]`, and the fast-forward is what lets `git branch --merged` recognize a branch that was merged
upstream. So classification reflects **remote reality**, not stale local state.

### `gone` and "merged upstream then deleted"

A branch merged on the server **and then deleted** there is the common case behind a stale local view.
After fetch+prune it shows `upstream:track = [gone]`. Two sub-cases, distinguished by `ahead`
(`git rev-list --count <default>..<branch>`):

- **`ahead == 0`** — the default branch already contains all of its commits. It was *merged upstream
  then deleted* → reason `"merged upstream then deleted on remote — safe to delete locally"`. It is a
  delete candidate, **never** a "merge-worthy variant" / merge candidate, and its (nonexistent) remote
  pipeline is not flagged (it no longer appears in the server's pipeline list).
- **`ahead > 0`** — it has commits not on the default branch; reported as `gone` with the count, so
  unmerged work isn't silently discarded (still `-D`, low–med risk).

Because a `gone` branch is never categorized `keep`, the report's "Active / unmerged branches (merge
candidates)" list (which selects `keep` + `active, unmerged` + `ahead>0`) cannot suggest re-merging it.

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
