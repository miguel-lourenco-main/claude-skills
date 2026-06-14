---
description: Read-only git audit across one repo or the whole fleet (forces analyze mode; never changes anything).
argument-hint: "[repo path | 'fleet' | repo name]  [--optimize]"
---

Run a **read-only** git audit. Use the git-steward skills in **analyze mode only** — do not modify
anything, do not delete, do not push.

Target: `$ARGUMENTS`
- If it names a single repo path or repo name → use the `repo-steward` skill (analyze) on that repo.
- If it is empty or says "fleet" / "all" → use the `fleet-steward` skill (analyze): resolve/load the
  fleet, then run the read-only fan-out across it.
- If it contains `--optimize` (or "full"/"deep") → include the optimize-tier skills.

Present the `attention` roll-up (health flags, prunable branches, non-conventional commits, secret
findings, big blobs, open work items, CI status), most-flagged repos first, then offer concrete next
steps (which skills to run in apply mode) — but make no changes in this command.
