# model-router

Quota-aware model routing for Claude Code. The main session stays on its model (Opus by default);
mechanical work is delegated to Haiku and Sonnet.

Why: an analysis of a month of sessions (2026-08-14 to 09-13, 265 transcripts) found under 3% of
turns ran below Opus. About 90% of subagent spawns inherited Opus or Fable, workflow scripts never set a
model, and about a third of main-session tool turns were git, CI polling, sleeps, and file inspection.

## What it ships

| Component | Model | Purpose |
|---|---|---|
| `hooks/hooks.json` + `policy/ROUTING.md` | - | Injects the tier table and delegation rules at every session start |
| `model-router:ci-watcher` | Haiku | Wait on pipelines, MRs, shells, agents; report failures. Read-only |
| `model-router:sweeper` | Sonnet | One slice of a research or extraction sweep |
| `model-router:mechanic` | Sonnet | Apply an already-decided change |
| `model-router:reviewer` | Sonnet | Persona, prose, and consistency reviews |
| `model-router:sysadmin` | Sonnet | Linux workstation troubleshooting |
| `/model-router:status-report` | Sonnet | Pull and report repo state |
| `/model-router:ship` | Sonnet | Commit and push |
| `/model-router:routing-policy` | - | The policy on demand, plus how to run the analyzer |
| `/model-router:setup` | - | Per-machine settings a plugin cannot ship |
| `scripts/analyze.py` | - | Measure turns and tokens per model over a date window |

## Install on each workstation

```text
/plugin marketplace update claude-skills
/plugin install model-router@claude-skills
/model-router:setup
```

`setup` writes two keys into that machine's `~/.claude/settings.json` (with a backup):
`env.CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"`, so subagents spawned without a model default to Sonnet;
and `extraKnownMarketplaces.claude-skills.autoUpdate = true`, so later versions of this plugin arrive
without a manual update. Start a new session afterwards.

## Changing the policy

Edit `policy/ROUTING.md`, bump `version` in `.claude-plugin/plugin.json` and the marketplace entry, and
push. Machines with auto-update pick it up on their next session; otherwise run
`/plugin marketplace update claude-skills`.

## Measuring

```sh
python3 plugins/model-router/scripts/analyze.py --since 2026-08-14 --until 2026-09-13   # baseline
python3 plugins/model-router/scripts/analyze.py --since <install date>
```

Targets after a week: top-tier inherited spawns under 20%, Sonnet plus Haiku above 30% of subagent
turns.

## Limits

- Hooks cannot switch the model of a turn, so the main session's model is still chosen by you
  (`/model`). The policy asks Claude to delegate instead.
- Effort cannot be set per subagent definition; workflow `agent()` calls can set `effort`.
