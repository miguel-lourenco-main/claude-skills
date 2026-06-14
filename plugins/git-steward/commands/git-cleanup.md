---
description: Apply core git cleanup to one repo or the fleet (branch/commit/history hygiene, work-items, CI) — gated with confirmations.
argument-hint: "[repo path | 'fleet' | repo name]"
---

Run a **core** git cleanup pass in **apply mode**, honoring every safety gate in
`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md` (default dry-run, tiered confirmations, backups before any
history rewrite, never touch default/current branch).

Target: `$ARGUMENTS`
- Single repo → use the `repo-steward` skill (apply, core only): run the core atomic skills in the safe
  order, each behind its own confirmation gate. Show the consolidated plan first.
- Empty / "fleet" / "all" → use the `fleet-steward` skill (apply): run the fleet scope gate first if no
  saved fleet exists, present a single top-level confirmation listing every affected repo, then dispatch
  one sub-agent per repo running `repo-steward` apply.

Do **not** include the optimize-tier skills here (use `/git-optimize` for that). Always show plans and
get explicit confirmation before mutating; report exactly what changed.
