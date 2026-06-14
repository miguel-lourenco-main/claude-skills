---
description: Full git sweep — core cleanup PLUS the optimize tier (worktrees, .gitignore, consistency, deps, changelog, stale triage), gated.
argument-hint: "[repo path | 'fleet' | repo name]"
---

Run a **full sweep** in **apply mode** with `--optimize` on: core cleanup **plus** the optimize-tier
skills (`worktree-manager`, `gitignore-guard`, `repo-consistency`, `dependency-health`,
`release-changelog`, `stale-repo-triage`). Honor every gate in `${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`.

Target: `$ARGUMENTS`
- Single repo → `repo-steward` skill (apply, `--optimize`): core skills first in the safe order, then the
  optimize-tier, each behind its own confirmation gate.
- Empty / "fleet" / "all" → `fleet-steward` skill (apply, `--optimize`): run the scope gate if needed,
  present a single top-level confirmation listing every affected repo, then one sub-agent per repo.

Show the consolidated plan, confirm before mutating, and report what changed per repo and per skill.
Remember the optimize tier is good-to-have, not critical — treat its changes as lower priority and easy
to skip per repo.
