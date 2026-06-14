---
name: stale-repo-triage
description: This skill should be used when the user asks "which of my repos are dormant", "find abandoned repos", "what can I archive", "how stale is this repo", or wants to surface inactive projects across the fleet. Read-only — it classifies a repo's dormancy and recommends archive/keep; it never changes anything. Optimize-tier — runs in a fleet/repo pass only with --optimize, or standalone on request.
version: 0.1.0
---

# stale-repo-triage

Classify how dormant a repository is and recommend whether to keep, watch, archive, or delete it.

`class: optimize` — included in `repo-steward`/`fleet-steward` only with `--optimize`; always usable on
its own. **Read-only — no apply mode** (archiving/deleting a repo is a deliberate human decision).

## Use

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/stale-repo-triage/scripts/analyze.sh --repo <path>
```
Emits `stale-repo-triage/v1` with `days_since_last_commit`, recent commit counts, a `tier`, and a
`recommendation`.

## Tiers

| Tier | Days since last commit | Recommendation |
|---|---|---|
| `active` | ≤ 30 | actively developed |
| `slowing` | 31–90 | keep an eye on it |
| `dormant` | 91–365 | consider archiving if unused |
| `abandoned` | > 365 | strong candidate to archive/delete |
| `empty` | no commits | consider removing |

Across many repos, `fleet-steward --optimize` runs this per repo; rank by `tier`/`days` to surface the
most dormant first. Recommend actions to the user — never archive or delete on their behalf.
