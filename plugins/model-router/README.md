# model-router

Quota-aware model routing for Claude Code. The main session stays on its model (Fable, the user's
default); judgement-heavy delegated work goes to Opus, and mechanical work to Haiku and Sonnet.

Why: an analysis of a month of sessions (2026-08-14 to 09-13, 265 transcripts) found under 3% of
turns ran below Opus. About 90% of subagent spawns inherited Opus or Fable, workflow scripts never set a
model, and about a third of main-session tool turns were git, CI polling, sleeps, and file inspection.

## What it ships

| Component | Model | Effort | Purpose |
|---|---|---|---|
| `hooks/hooks.json` + `policy/ROUTING.md` | - | - | Injects the tier table and delegation rules at every session start (and after clear, compact, fork) |
| `model-router:ci-watcher` | Haiku | low | Wait on pipelines, MRs, shells, agents via `Monitor` until-loops; report failures. Read-only |
| `model-router:sweeper` | Sonnet | default | One slice of a research or extraction sweep |
| `model-router:mechanic` | Sonnet | low | Apply an already-decided change |
| `model-router:reviewer` | Sonnet | default | Persona, prose, and consistency reviews |
| `model-router:sysadmin` | Sonnet | default | Linux workstation troubleshooting |
| `/model-router:status-report` | Sonnet | low | Pull and report repo state |
| `/model-router:ship` | Sonnet | low | Commit and push |
| `/model-router:routing-policy` | - | - | The policy on demand, plus how to run the analyzer |
| `/model-router:setup` | - | - | Per-machine settings a plugin cannot ship |
| `/model-router:usage-review` | Sonnet | default | Bi-weekly per-workstation analysis, recorded, with policy suggestions |
| `scripts/analyze.py` | - | - | Measure turns and tokens per model over a date window |

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

## Bi-weekly usage review

Every workstation reviews its own usage every 14 days. The record lives outside the plugin, in
`~/.claude/model-router/usage-review.json`, with markdown reports in `~/.claude/model-router/reports/`.
The session-start hook checks it on every session and asks Claude to run `/model-router:usage-review`
when the last analysis is no longer valid:

- no record on this machine, or the record can't be read
- the record came from an older analyzer version (bump `ANALYZER_VERSION` in `scripts/review_state.py`
  when the metrics change meaning)
- the record belongs to another host (for example a synced home directory)
- the record is dated in the future
- the last analysis is 14 or more days old

Each review picks up where the previous one ended, compares against it, and suggests policy changes.
Those changes are made here, in the repo, so every workstation gets them.

## Measuring by hand

```sh
python3 plugins/model-router/scripts/analyze.py --since 2026-08-14 --until 2026-09-13   # baseline
python3 plugins/model-router/scripts/analyze.py --since <install date>
```

Targets after a week: top-tier inherited spawns under 20%, Sonnet plus Haiku above 30% of subagent
turns.

## Waiting without `sleep`

The harness blocks a Bash command that starts with `sleep` (including `sleep N && ...`) and chains of
shorter sleeps. `ci-watcher` therefore waits with the `Monitor` tool and a single until-loop, and the
policy tells the main session to put its own long-running commands in a background Bash or a
`Monitor` instead of polling.

## Limits

- Hooks cannot switch the model of a turn, so the main session's model is still chosen by you
  (`/model`). The policy asks Claude to delegate instead.
- `effort` is set per agent or skill definition (`effort:` in the frontmatter) and per workflow
  `agent()` call; a caller's explicit `model` still overrides an agent's frontmatter, which is why the
  policy asks not to raise a `model-router:*` worker's model unless its Sonnet result failed.
