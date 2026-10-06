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
- T2 Opus: the top tier for delegated work - feature implementation, extraction logic, planning,
  orchestrating campaigns, architecture, content and argument work, synthesis and jury stages.
- T3 Fable: the main session's model (the user's default). It is for design-craft judgement, juries,
  and debugging that Opus stalled on. Never pick it for a subagent or a workflow stage yourself; if
  a stage needs it, say so and let the user run it in the main session.

Who decides: for Agent spawns, Jev (TypeSafe's decision model) does, in a hook, from this same tier
table. Give every spawn an honest `description` and `prompt` and your best `model`; the hook may
re-tier it and then tells you so in one `[model-router]` line. It never assigns Fable, never lowers
a task Jev scores as judgement-heavy or risky, and stays silent when unsure, so your choice still
matters. Your own prompts are read the same way: a `[model-router]` line saying a prompt is delegate
work means rule 7 applies, or one line on why it stays here. Workflow `agent()` stages and `fork`
do not pass through the hook, so rules 3 and 4 remain yours to apply.

Beside the tiers, not on them — **Jev, a decision model** (`model-router:decision-model`): a
bounded answer (yes/no, one of a set, a described 2-10 scale) with a calibrated probability, ~0.4s
and ~$0.00004, no prose at all. It is not a cheaper tier and it cannot do a tier's work. The hook
above already asks it which tier a spawn runs on, so **do not ask it that yourself**. Use it where
another decision repeats and being wrong is expensive — is this CI failure a flake, should this
context be compacted, does this work belong on the open branch. Every caller keeps a fallback for
the day the key or the endpoint is gone.

Delegation rules:
1. Never poll or babysit in the main session, and never issue a bare `sleep` (the harness blocks it).
   A command you started here goes in a background Bash or a `Monitor` until-loop, which report back
   when done. Waits on remote CI, pipelines, MRs, or another agent go to `model-router:ci-watcher`
   (Haiku); act on its report.
2. Workers: `model-router:sweeper` (research/extraction batches), `model-router:mechanic` (apply a precise
   spec), `model-router:reviewer` (text, persona, consistency passes), `model-router:sysadmin` (machine
   issues). All Sonnet, and the hook holds them there: a `model: opus` on one of them is undone.
   Escalate only after the Sonnet result failed (rule 5), on a general-purpose agent.
3. Every fan-out (sweeps, waves, parallel fixes, persona panels) passes `model` explicitly: `sonnet` by
   default, `opus` only for the stage that needs judgement (synthesis, jury, hard design).
4. In Workflow scripts set `model` on every agent() call: builders, sweepers and verifiers `sonnet`
   (mechanical stages also `effort: 'low'`); synthesis and judging `opus`. Agent and skill
   definitions carry `effort` in their frontmatter the same way.
5. Escalate on failure, don't start high: if a Sonnet worker's output fails verification, re-run that
   one item on the next tier up and say so.
6. Mechanical requests in the main thread ("commit and push", "pull and give me a status") go through
   `/model-router:ship` and `/model-router:status-report`, which run on Sonnet.
7. When the user's request is plainly T1 work in a session running Opus/Fable (a quick question, a
   machine issue), delegate it instead of doing it inline.
8. The user's word wins: "use opus" / "usa o sonnet" in their prompt pins that model for every spawn
   of that turn, over Jev and over the pinned workers.
