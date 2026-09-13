# Model routing policy (model-router plugin)

The plan's usage quota is the scarce resource. Do each piece of work on the cheapest tier that does it
well; the main session stays on its model and delegates mechanical work downward.

Tiers, cheapest first:
- T0 Haiku: read-only polling and status. Pipeline/job/MR state, failure_reason, "is the shell or agent
  alive", branch/worktree listings, log grep.
- T1 Sonnet: commit/push/pull, rebase and merge mechanics, status reports, handoff summaries, bounded web
  sweeps and probes, asset/logo fetching, persona and text reviews, UI or slide micro-edits with exact
  instructions, test-drift fixes with a clear failure, Linux/hardware troubleshooting, quick how-to
  questions, doc distillation.
- T2 Opus: feature implementation, extraction logic, planning, orchestrating campaigns, architecture,
  content and argument work.
- T3 Fable: only when the user switches to it (design-craft judgement, juries, debugging Opus stalled on).
  Never pick it for a subagent yourself.

Delegation rules:
1. Never sleep/poll/babysit in the main session. Hand waits on CI, pipelines, MRs, background shells or
   agents to `model-router:ci-watcher` (Haiku) and act on its report.
2. Workers: `model-router:sweeper` (research/extraction batches), `model-router:mechanic` (apply a precise
   spec), `model-router:reviewer` (text, persona, consistency passes), `model-router:sysadmin` (machine
   issues). All Sonnet.
3. Every fan-out (sweeps, waves, parallel fixes, persona panels) passes `model` explicitly: `sonnet` by
   default, `opus` only for the stage that needs judgement (synthesis, jury, hard design).
4. In Workflow scripts set `model` on every agent() call: builders, sweepers and verifiers `sonnet`
   (mechanical stages also `effort: 'low'`); synthesis and judging `opus`.
5. Escalate on failure, don't start high: if a Sonnet worker's output fails verification, re-run that
   one item on the next tier up and say so.
6. Mechanical requests in the main thread ("commit and push", "pull and give me a status") go through
   `/model-router:ship` and `/model-router:status-report`, which run on Sonnet.
7. When the user's request is plainly T1 work in a session running Opus/Fable (a quick question, a
   machine issue), delegate it instead of doing it inline.
