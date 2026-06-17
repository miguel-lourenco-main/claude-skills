---
name: pipeline-sentinel
description: This skill should be used when the user wants to watch CI across MANY repos at once and auto-fix what breaks — e.g. "monitor every repo and every pipeline", "keep all my CI green", "watch all my pipelines and fix failures", "autofix failing pipelines across my repos", "CI watchdog for the fleet", "fleet-wide autofix-pr", or "alert me when any pipeline goes red". It sweeps every pipeline in every repo of the fleet, diagnoses failures, and — per a user-controlled policy (gated by default, auto per allowlist) — fixes, pushes, and monitors them. Runs one-shot, on an in-session loop, or as an always-on cron. Never pushes the default branch.
version: 0.1.0
---

# pipeline-sentinel (Tier 3)

A fleet-wide CI watchdog: `pipeline-health` on steroids. It enumerates **every pipeline in every repo**
of the fleet, diagnoses every failure, and applies the diagnose → fix → push → monitor loop to the ones
a **user-controlled policy** authorizes — gated by default, autonomous per an allowlist. Composes
`fleet-steward` (fleet resolution) + `pipeline-health` (per-pipeline diagnose/fix loop).

`class: core` standalone watchdog — invoke it directly; it is not part of the `repo-steward` core pass.

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): sweep + diagnose + decide + report. **No pushes.** Triggers: "what's red across
  my repos", "show me failing pipelines everywhere", "sweep CI".
- **fix**: execute the authorized fixes (auto items, plus any gated items the user checked/approved).
  Triggers: "fix everything that's broken", "autofix the fleet", "make all my CI green". Gated per
  policy (Tier 2 — pushes); never the default branch. When ambiguous, analyze.

## How to use

### Step 0 — Fleet + policy (first run)

- **Fleet**: reuse `fleet-steward`'s saved fleet (`.git-steward/fleet.json`). If none exists, run its
  scope gate first (`fleet-steward/scripts/resolve_fleet.sh --source … --save`) so the user chooses
  which repos are watched. The sweep falls back to workspace discovery if nothing is saved.
- **Policy**: `bash ${CLAUDE_PLUGIN_ROOT}/skills/pipeline-sentinel/scripts/policy.sh --init` writes the
  default policy (everything **gated**, default branch **report**, infra **escalate**). The user owns
  it. Promote a cause to autonomous with `--set <cause>=auto` (e.g. `lint=auto`), or just ask
  ("auto-fix lint everywhere") and edit the file. See `references/policy.md`.

### Step 1 — Sweep (read-only)

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/pipeline-sentinel/scripts/sweep.sh [--deep-max 10]
```

Emits `pipeline-sentinel/v1`: per repo, every pipeline with status, classified `cause`, and a policy
`decision` (**auto** | **gated** | **report** | **escalate**); fleet `totals`; and a consolidated
`report` markdown path. Present the totals, then point the user at the report. **Change nothing in
analyze mode.**

### Step 2 — Execute authorized fixes (fix mode)

The report's **Actions** list has one parseable item per fixable failure
(`<!--ps op=pipeline-fix repo=… branch=… cause=… decision=…-->`): `auto` items pre-checked, `gated`
items as empty boxes. For each item to run (all `auto`; plus `gated` items the user checked), do **one
repo/branch at a time**:

```
For each item:
  1. cd to repo, check out <branch> (refuse if it is the default branch — report-only).
  2. analyze that branch:  pipeline-health/scripts/analyze.sh --repo <path> --branch <branch>
  3. if cause == infra  → STOP, escalate (not agent-fixable).
  4. author a scoped fix for the diagnosed cause, commit it.
  5. GATE: if decision == gated → show the diff + target branch; proceed only on explicit yes.
           if decision == auto  → proceed (policy already authorized this cause).
  6. push + monitor (Tier 2):
       pipeline-health/scripts/apply.sh --repo <path> --push-and-monitor --confirm
  7. passed → report green. else dedup on failure_signature + honor max_attempts (policy);
     repeated signature or budget exhausted → STOP and surface.
```

This is exactly `pipeline-health`'s bounded fix loop, run per target. All its guards apply
(`MAX_ATTEMPTS`, signature dedup, poll timeout). **Never push the default branch** — those failures are
report-only; fix them via a branch/MR.

### Step 3 — Make it continuous (selectable)

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/pipeline-sentinel/scripts/watch.sh [--interval-min 15]
```

Prints the three monitoring modes filled in for this machine (`sentinel-watch/v1`): **one-shot** (just
re-run the sweep), **in-session `/loop`** (re-sweep while the session is open — hand the user the
`/loop …` line, or invoke the `loop` skill), and **always-on cron** (a scheduled cloud agent via the
`schedule` skill / `CronCreate`, with the emitted `cron_expr` + `agent_prompt`). See
`references/monitoring.md`. **Recommend the cron agent run the `auto` allowlist only** — an unattended
run must never hit a gate it can't answer.

## Safety & guardrails

- **Default branch is never pushed** (`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md` never-touch list);
  default-branch failures are reported as alerts only.
- **Gated by default.** Autonomy is opt-in per cause, and the user has full control over what runs
  (policy file + per-item checkboxes).
- **Fleet-level gate** for a multi-repo fix pass: present one top-level confirmation listing every repo
  and branch to be pushed before starting (SAFETY fleet gate). Excluded repos/branches are never touched.
- **No CI/secret-file rewrites** — stop and ask instead.
- **Loop guards** bound CI spend: `--deep-max`, `max_attempts`, failure-signature dedup, poll timeouts;
  `infra`/quota is escalated, never retried.

## Additional resources

- **`scripts/sweep.sh`** — fleet × every-pipeline scan + policy decisions + consolidated report.
- **`scripts/policy.sh`** — the user-controlled autofix policy (`--init`, `--set <cause>=<mode>`).
- **`scripts/watch.sh`** — the three continuous-monitoring setups, filled in.
- **`references/policy.md`** — decision model + policy schema.
- **`references/monitoring.md`** — one-shot vs `/loop` vs cron, and cost/loop guards.
- **`${CLAUDE_PLUGIN_ROOT}/skills/pipeline-health/`** — the per-pipeline diagnose/fix engine it builds on.
