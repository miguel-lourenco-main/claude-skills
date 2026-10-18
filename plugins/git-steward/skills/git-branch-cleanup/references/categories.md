# branch-cleanup/v1 — categories and schema

## Categories

| Category | Definition | Delete flag | Risk |
|---|---|---|---|
| `merged` | Fully merged into the default branch: an ancestor (`merge_type: ancestor`), or every change already present by patch-id / tree (`merge_type: squash-rebase`) | `-d` for ancestor, `-D` for squash-rebase | low |
| `gone` | Upstream deleted on the remote (`upstream:track` = `[gone]`) **and** commits not in the default branch. `needs_decision: true` — never auto-queued | only by name, with `--allow-unmerged` (`-D`) | high (unmerged work) |
| `stale` | Not merged/gone, and no commit in `stale_days` (default 90) | `git branch -D` | medium (may hold unmerged work) |
| `keep` | Default branch, current branch, or active & unmerged | never deleted | — |

Checks are evaluated in order: protected (default/current/worktree) → merged (ancestry, then content)
→ gone → stale → keep. The first match wins, so a stale-but-merged branch is reported as `merged`, and a
gone branch whose work landed is reported as `merged` with "(upstream deleted on remote)" in its reason.
The content ladder is `gs_classify_branch_vs_default` in `shared/git-content.sh`, shared with
worktree-manager and `inspect.sh`.

Every candidate also carries `removable` (true when deleting it loses nothing: the content verdict) and
`needs_decision` (true for `gone`). `summary.prunable` counts what the report offers as delete
checkboxes; `summary.needs_decision` counts the rest.

### Reconciled view (run before analysis)

`shared/sync-remote.sh` runs once per repo before this analyzer (via `repo-steward/run_repo.sh`):
it does `git fetch --all --prune --tags` and, when safe (clean tree, default branch strictly behind),
fast-forwards the default branch. The `--prune` is what turns a branch whose remote was deleted into
`[gone]`, and the fast-forward is what lets `git branch --merged` recognize a branch that was merged
upstream. So classification reflects **remote reality**, not stale local state.

### `gone` and "merged upstream then deleted"

A branch merged on the server **and then deleted** there is the common case behind a stale local view.
After fetch+prune it shows `upstream:track = [gone]`. What decides it is content, not the upstream:

- **Its work is in the default branch** — as an ancestor, or by patch-id / tree after a squash or
  rebase merge. It is reported as `merged` ("… (upstream deleted on remote)"), a delete candidate,
  **never** a merge candidate, and its (nonexistent) remote pipeline is not flagged.
- **It still has commits whose changes the default branch lacks** — `gone`, `needs_decision: true`.
  The report lists it under "needs your decision" with no checkbox, and apply.sh refuses it unless the
  user names it with `--branches … --allow-unmerged`. An MR closed without merging, or a remote branch
  deleted by hand, leaves exactly this state, and the commits exist nowhere else.

The content tests, cheapest first (`branch_content_in_default`): every commit has a patch-id twin in
the default branch (`git cherry`); the trees are identical; merging the branch into the default branch
is a no-op (`git merge-tree --write-tree`, git ≥ 2.38); the branch's whole diff from the merge-base has
the patch-id of one default-branch commit (a squash whose lines were edited again later). If a test
cannot run, the answer is "not merged", so a failure can only keep a branch.

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
    { "branch": "feature/done", "sha": "abc1234", "category": "merged", "merge_type": "ancestor",
      "reason": "fully merged into main", "upstream_track": "", "recoverable": true,
      "removable": true, "needs_decision": false, "ahead": 0, "behind": 4 },
    { "branch": "feature/abandoned", "sha": "def5678", "category": "gone", "merge_type": "",
      "reason": "upstream deleted on remote, but 2 commit(s) are not in main (…) — unique work, needs your decision",
      "upstream_track": "[gone]", "recoverable": true,
      "removable": false, "needs_decision": true, "ahead": 2, "behind": 9 }
  ],
  "summary": { "merged": 1, "gone": 1, "stale": 0, "keep": 3, "needs_decision": 1, "prunable": 1 },
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
