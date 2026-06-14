---
name: pipeline-health
description: This skill should be used when the user asks "is CI green", "why is the pipeline failing", "check the build", "fix CI", "make the pipeline pass", "diagnose the failing job", "monitor the run", or wants to inspect or repair GitLab CI pipelines / GitHub Actions runs. Defaults to read-only status + diagnosis; applying a fix, pushing, and monitoring happens only in fix mode behind a confirmation gate, and never on the default branch.
version: 0.1.0
---

# pipeline-health

Check a repo's CI status, diagnose failing jobs from their logs, and — in fix mode — apply a fix, push,
and monitor the new pipeline until it passes or the retry budget is exhausted.

`class: core` — runs on every `repo-steward` / `fleet-steward` pass.

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): report pipeline status, list failing jobs, fetch their logs, and classify the
  likely cause. **No changes.** Trigger on "is CI green / why failing / check the build / diagnose".
- **fix**: author a fix, then push and monitor. Trigger on "fix CI / make it pass / get the pipeline
  green". Gated (Tier 2 — pushes); never pushes the default branch. When ambiguous, analyze.

## How to use

### Analyze
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/pipeline-health/scripts/analyze.sh --repo <path> [--branch <name>]
```
Emits `pipeline-health/v1` JSON: overall status, every job with status/stage, the `failing` jobs with a
`log_excerpt` and a classified `cause` (lint, test, build, hygiene, infra, unknown), the dominant
`likely_cause`, and `agent_fixable`. If no pipeline/forge is available it returns
`{available:false, reason:…}`. Defaults to the current branch.

Report the status and, for failures, the diagnosis and a proposed fix **in prose** — do not change
anything in analyze mode.

### Fix → push → monitor loop
The model authors the fix (edit files, commit) based on the diagnosis; the script handles the
deterministic push + monitor. Run the loop with a bounded retry budget:

```
MAX_ATTEMPTS = 3 ; seen_signatures = []
1. analyze → diagnose cause.
2. if cause == infra  → STOP, escalate to the user (not agent-fixable).
3. author a scoped fix, commit it.
4. CONFIRMATION GATE (first push): show the diff + target branch; proceed only on explicit approval.
5. push + monitor:
     bash .../pipeline-health/scripts/apply.sh --repo <path> --push-and-monitor --confirm
6. if result.passed → STOP, report green.
7. else compute result.failure_signature:
     - if signature already in seen_signatures → STOP ("no progress, escalate").
     - add it; if attempts >= MAX_ATTEMPTS → STOP ("retry budget exhausted").
     - else go to 1.
```

`apply.sh --push-and-monitor` pushes the current branch and polls the new pipeline every `--interval`
seconds up to `--max-polls` times (default ~6 min), returning `pipeline-monitor-result/v1` with
`final_status`, `passed`, and a `failure_signature` (cause + sorted failing-job names) used for dedup.
Use `--monitor-only` to watch without pushing.

## Guards against wasted CI / infinite loops

- Hard cap `MAX_ATTEMPTS` (default 3).
- **Signature dedup**: the same cause + same failing jobs twice in a row → stop; the fix isn't working.
- Per-attempt polling timeout (`--max-polls × --interval`).
- **Never push the default branch** (the script refuses) and never touch CI/secret files automatically
  (`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`) — stop and ask instead.
- `infra` and persistent `flaky` causes are escalated to the user, not "fixed" with code.

## Additional resources

- **`references/failure-taxonomy.md`** — cause signatures and fix postures; `pipeline-health/v1` schema.
- **`${CLAUDE_PLUGIN_ROOT}/shared/FORGE.md`** — GitLab/GitHub CI command abstraction.
