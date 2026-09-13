---
name: git-repo-health
description: This skill should be used when the user asks to "check repo health", "what's the state of this repo", "give me a git status overview", "how healthy is my repo", "show repo activity/dormancy", "is this repo stale", "audit repo health", or wants a snapshot of branches, sync status, working-tree cleanliness, activity, contributors, or large files for one or more repositories. Read-only — it reports and points at remediation, never changes anything.
version: 0.1.0
model: sonnet
---

# git-repo-health

Produce a fast, read-only health snapshot of a git repository: working-tree cleanliness, sync status
versus upstream, branch inventory (including merged/stale counts), activity and dormancy, contributors,
and the largest tracked blobs. Surface advisory **flags** that point at remediation, without performing
any change.

`class: core` — runs on every `repo-steward` / `fleet-steward` pass.

## Modes

This skill is **read-only by design and has no apply mode** — it is the principled exception to the
analyze/apply convention (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`). It never mutates a repo. When a
flag indicates a fixable problem, name the skill that fixes it rather than acting:

- `merged-branches-prunable`, `stale-branches>Nd` → `git-branch-cleanup`
- `largest_blobs` that look like committed build artifacts → `git-history-surgery` (remove from history)
  and `gitignore-guard` (stop re-committing them)
- `unpushed-commits` / `behind-upstream` / `uncommitted-changes` → report to the user as state to resolve
- `repo-dormant>180d` → `stale-repo-triage` (when `--optimize` is set)

## How to use

Run the analyzer against the target repo and report from its JSON:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-repo-health/scripts/analyze.sh --repo <path> [--stale-days 90]
```

The script emits a `repo-health/v1` JSON object (schema in `references/health-metrics.md`). It needs no
forge or network — pure git — so it always works, even for repos with no remote or an absent `gh`.

To report:

1. Run `analyze.sh`; parse the JSON.
2. Present a short snapshot: name, current/default branch, dirty/untracked counts, ahead/behind,
   local/remote/merged/stale branch counts, days since last commit, commits in the last 90 days, total
   commits, contributors, and any largest blobs over a few MB.
3. List the `flags` array as a "needs attention" section, and for each flag name the remediation skill
   from the mapping above. Keep it scannable.

For multiple repos, run the analyzer once per repo and present a comparison table sorted by flag count
(most-flagged first). This is exactly how `repo-steward`/`fleet-steward` consume it.

## Interpreting key fields

- `branches.merged_into_default` — branches fully merged into the default branch; safe-to-prune
  candidates (confirm with `git-branch-cleanup`).
- `branches.stale` — local branches with no commit in `stale_days` (default 90).
- `activity.days_since_last_commit` = `-1` means no commits found (empty repo).
- `largest_blobs` lists the biggest objects across all history — large `.a`/`.zip`/`.bin`/media files
  here usually mean build artifacts or assets that bloat the repo.

## Additional resources

- **`references/health-metrics.md`** — the full `repo-health/v1` schema and how each metric is computed.
- **`${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`** — the analyze/apply + `--optimize` conventions.
- **`${CLAUDE_PLUGIN_ROOT}/shared/FORGE.md`** — forge abstraction (not required here; health is git-only).
