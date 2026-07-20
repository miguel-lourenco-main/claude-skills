# Facts toolbox — read-only probes (`shared/inspect.sh`)

git-steward decisions should be made by **gathering facts, then judging** — not by trusting a
blunt heuristic or dead-ending on a precondition. `inspect.sh` is the read-only fact toolbox the
agent calls ad hoc. Every probe is **safe to run any time** — none mutates the repo. Output is a
compact `probe/<name>/v1` JSON envelope on stdout.

```
bash ${CLAUDE_PLUGIN_ROOT}/shared/inspect.sh <probe> [--repo <path>] [args]
bash ${CLAUDE_PLUGIN_ROOT}/shared/inspect.sh --list        # human catalog
bash ${CLAUDE_PLUGIN_ROOT}/shared/inspect.sh --manifest    # JSON catalog (machine-discoverable)
```

## When to reach for a probe

When an action is **blocked** by a precondition (an `apply.sh` prints `REFUSED:`, a gate fails, a
premise looks false), do **not** immediately ask the user. First INVESTIGATE with the relevant
probe(s), then JUDGE whether a safe, recoverable pre-step clears the block, then PROPOSE it as a
gated remediation. Only ask the user when the facts genuinely don't resolve it.

> **Worked example — history rewrite refused because the repo has >1 worktree.** Run
> `inspect.sh worktrees`. Each non-primary worktree's branch is classified `removable:true`
> (already merged — `merged-ancestor` / `squash-rebase-redundant`) or `removable:false` (holds
> unique work). Recommend removing the redundant ones as a gated Tier-1 `worktree-remove` pre-step,
> then proceed. Only the worktrees with unique unpushed work are a genuine question for the user.

## Catalog

| Probe | Use it to learn… | Key inputs |
|---|---|---|
| `worktrees` | every worktree + whether each branch is removable vs holds unique work | `--repo` |
| `branch-classify` | a branch's (or `--all`) verdict vs the default: `merged-ancestor` / `squash-rebase-redundant` / `gone` / `diverged` / `unique-work`, with ahead/behind + diffstat | `--repo --branch <b>` \| `--all` |
| `branch-merged` | quick true/false: is a branch fully integrated into the default (incl. squash/rebase)? | `--repo <branch>` |
| `tree-status` | working-tree cleanliness: dirty/untracked counts + the path lists | `--repo` |
| `merge-base` | merge-base of two refs + ahead/behind + is-ancestor | `--repo --a <ref> --b <ref>` |
| `file-diff` | diffstat + per-file numstat between two refs | `--repo --base <ref> --ref <ref>` |
| `upstream` | a branch's upstream tracking ref + ahead/behind + `gone` | `--repo <branch>` |
| `ci-status` | CI / pipeline health (delegates to `pipeline-health` analyze) | `--repo` |
| `secret-context` | secret + oversized-blob scan over owned history (delegates to `git-history-surgery` analyze) | `--repo` |

The classification verdicts come from `shared/git-content.sh` (`gs_classify_branch_vs_default`) —
the same `git cherry` + tree-equality content test `git-branch-cleanup` uses, so a probe and the
batch report never disagree about whether a branch is redundant.
