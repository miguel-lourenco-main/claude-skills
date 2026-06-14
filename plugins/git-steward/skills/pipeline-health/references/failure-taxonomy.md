# pipeline-health — failure taxonomy and schema

`analyze.sh` classifies each failing job by matching its name and log tail against signatures. Cause is
deterministic-first so the diagnosis is reproducible; the model adds judgement on top.

## Causes

| Cause | Signals (job name / log) | Fix posture |
|---|---|---|
| `lint` | `fmt`, `lint`, `prettier`, `eslint`, `rustfmt`, `typecheck`, `tsc`, "would reformat" | usually auto-fixable (`cargo fmt`, `eslint --fix`, type fix) — low risk |
| `test` | `test`, `spec`, "assert", "panicked", "failures:" | scoped code fix; may need investigation |
| `build` | `build`, `compile`, `check`, `error[`, "cannot find", "compilation failed" | scoped fix |
| `hygiene` | `hygiene`, "conflict marker" | targeted fix (resolve markers, restore required file) |
| `infra` | "no space left", "connection refused", "could not resolve host", "image pull", "runner system failure", "timed out" | **not agent-fixable** → escalate to the user |
| `unknown` | anything else | inspect the full log before acting |

`agent_fixable` is true for `lint`/`build`/`hygiene`/`test`. `infra` is always escalated. A failure that
recurs with an identical signature is treated as non-converging and stopped (see the loop guards in
SKILL.md).

## Commands used

GitLab (`glab`): `glab ci get -b <branch> -F json` (pipeline + jobs), `glab ci trace <job-id>` (log).
GitHub (`gh`): `gh run list -b <branch> --json …`, `gh run view <id> --json jobs`,
`gh run view <id> --log-failed`, `gh run watch <id> --exit-status` (blocking monitor).

## Schema (`pipeline-health/v1`)

```json
{
  "schema": "pipeline-health/v1",
  "available": true,
  "project": "public-work4/edgenchat",
  "branch": "main",
  "pipeline_id": "2583165751",
  "web_url": "https://gitlab.com/.../pipelines/2583165751",
  "status": "failed",
  "overall": "failed",
  "jobs": [ { "name": "rust:test", "status": "failed", "stage": "test", "id": 123,
              "cause": "test", "log_excerpt": "…" } ],
  "failing": [ { "name": "rust:test", "cause": "test", "…": "…" } ],
  "likely_cause": "test",
  "agent_fixable": true
}
```

Monitor result (`pipeline-monitor-result/v1`):
```json
{ "schema":"pipeline-monitor-result/v1", "branch":"feature/x",
  "final_status":"success", "failure_signature":"", "passed":true }
```
