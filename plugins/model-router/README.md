# model-router

Quota-aware model routing for Claude Code. The main session stays on its model (Fable, the user's
default); judgement-heavy delegated work goes to Opus, and mechanical work to Haiku and Sonnet.
Since 0.4.0 the tier of every Agent spawn is decided by Jev, TypeSafe AI's decision model, in a
hook, not by the orchestrating model's reading of the policy text.

Why: an analysis of a month of sessions (2026-08-14 to 09-13, 265 transcripts) found under 3% of
turns ran below Opus. About 90% of subagent spawns inherited Opus or Fable, workflow scripts never set a
model, and about a third of main-session tool turns were git, CI polling, sleeps, and file inspection.

## What it ships

| Component | Model | Effort | Purpose |
|---|---|---|---|
| `hooks/hooks.json` + `policy/ROUTING.md` | - | - | Injects the tier table and delegation rules at every session start (and after clear, compact, fork) |
| `scripts/route_spawn.py` (PreToolUse on Agent) | Jev | - | Re-tiers a subagent spawn from Jev's answer; holds the plugin's own agents to their frontmatter model; honours a user pin |
| `scripts/advise_prompt.py` (UserPromptSubmit) | Jev | - | Records a user pin ("use opus"); when Jev is confident a prompt is delegate work, injects one line naming the delegate |
| `scripts/jev.py` | - | - | The System One client, the questions, the decision rules, `--check`, `--explain`, `--samples`, `--status` |
| `policy/tiers.json` | - | - | The tier and route criteria in the words Jev sees |
| `scripts/jev_decide.py` | Jev | - | The shared client other plugins call for their own decisions: a CLI, question builders, an answer that is never an exception |
| `/model-router:decision-model` | Sonnet | - | When a decision belongs to Jev, how to shape the question, and when not to ask |
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

## Jev as the decider (0.4.0)

[Jev](https://docs.typesafe.ai) returns typed answers, not text: you send a `state` and a map of
questions (a `choice` among named options, a `score` on an ordered scale, a `noul` yes/no) and get
back the answer, a probability per option, and a calibrated confidence, in 70 to 500 ms, for
$0.042 per million input tokens (output is free). A routing decision costs a few millionths of a
dollar. It has no chat, no explanation, no tools, and known blind spots (counting, dates,
indirection, adversarial text), so it is used only for what every published guide says it is for:
a bounded classification, acted on above a confidence threshold, and never allowed to make
anything worse when unsure.

**Spawns.** `PreToolUse(matcher: "Agent")` sends Jev the subagent type, description, requested
model and the first 6,000 characters of the prompt, and asks three questions built from
`policy/tiers.json`: the cheapest tier that does the task well, how much open judgement it needs,
and whether it changes shared state that is hard to undo. Above the threshold (0.8) the hook
returns `updatedInput` with the model replaced and one `[model-router]` line saying so. It never
assigns Fable, never lowers a task Jev itself scores as judgement-heavy or risky, and does nothing
below the threshold. Precedence: a user pin in this turn's prompt, then this plugin's own agents
(held to their frontmatter model, so `model: opus` on `model-router:reviewer` is undone), then
`fork` and other plugins' agents (left alone), then Jev for everything else.

**Prompts.** A hook cannot change the main session's model, so the prompt half is advisory.
`UserPromptSubmit` asks Jev one question, "who should do this: the main session or one of the
delegates", and only when it is confident the prompt is ship, status-report, ci-watcher, sysadmin,
sweeper, mechanic or reviewer work does it inject one line naming the delegate. Slash commands,
`!` commands, short replies and sessions already on Haiku or Sonnet are skipped. The first prompt
of a session is read before the session's model is known, so it is always asked.

**Fail open.** No key, a timeout (4 s), an HTTP error or an unexpected answer means the spawn or
prompt goes through exactly as written and the log records why. Every decision is appended to
`~/.claude/model-router/decisions.jsonl`; `scripts/jev.py --explain` prints the last ones and the
usage review summarises them (re-tiered, guarded, below threshold, failed open, latency, cost).

**Quality samples.** The last 10 exchanges are kept verbatim in
`~/.claude/model-router/jev-samples.jsonl` (mode 600): the exact `state` and questions sent and the
exact answers, probabilities and usage returned. `scripts/jev.py --samples [N]` prints them so a
person can judge whether Jev is being asked the right thing and answering sensibly. Failed calls
are not samples. `samples_keep` in `jev.json` changes the count.

**What leaves the machine.** The text of each spawn prompt (truncated) and of each user prompt
(truncated) is sent to the provider (OpenRouter by default, TypeSafe direct with a
`TYPESAFE_API_KEY`). Nothing else: no file contents, no transcript, no tool results. Set
`route_spawns` or `advise_prompts` to `false` in `~/.claude/model-router/jev.json` to switch either
half off.

**Why a hook can do this.** The hooks reference and issues #44412 / #69545 say `updatedInput`
cannot change a subagent's model. Measured on 2.1.283 (2026-09-27) it can, up and down; the raw
payloads are in `research/2026-09-27-hook-model-rewrite/`. Because that is undocumented,
`scripts/verify_hook.sh` re-proves it in four throwaway sessions after each upgrade, and
`scripts/test_jev.py` (34 hermetic tests against a mock of `/v1/systemone`) covers the rules.
`scripts/mock_jev.py` lets a whole session run against a canned answer, which is how the hook
wiring was verified end to end: a spawn requested on Opus ran on Haiku.

Workflow `agent()` stages and `fork` do not pass through the hook (measured, same folder), so
policy rules 3 and 4 still apply to them.

## Jev for other plugins' decisions (0.5.0)

Which tier runs a spawn is one decision. Others have the same shape (bounded answer, repeats,
expensive to get wrong): is this CI failure a flake, does this work belong on the open branch.
`scripts/jev_decide.py` is the client those callers use, and `/model-router:decision-model` says
when a decision belongs to Jev and when it does not.

```bash
echo '{"state": {...}, "questions": {...}}' | python3 scripts/jev_decide.py
python3 scripts/jev_decide.py --self-test
```

It makes the same request as the hooks (`jev.post`), finds the key the same way (below), and
differs from them in two ways:

- **It never raises.** No key, a timeout or an outage return `{"ok": false, "reason": ...}`, and
  every caller keeps a fallback.
- **It writes nothing to the sample log**, which stays about routing.

**Where the key is found**, for the hooks and the shared client alike: the environment
(`OPENROUTER_API_KEY` or `TYPESAFE_API_KEY`), then `~/.claude/model-router/jev.env`, then any
other plugin's `jev.env` and any `.env` directly under `~/.claude` (`jev.KEY_FILES`). A key put
down for one plugin (context-checkpoint, say) therefore switches the decider on for this one
too; `scripts/jev.py --status` says which file answered.

Do not use it to ask which tier runs a task. The spawn hook already asks Jev that.

## Changing the policy

Edit `policy/ROUTING.md` and, if the tier wording changes, `policy/tiers.json` (what Jev reads), bump
`version` in `.claude-plugin/plugin.json` and the marketplace entry, and push. Machines with auto-update pick it up on their next session; otherwise run
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
  (`/model`). The prompt hook can only advise; the policy asks Claude to delegate.
- Jev's answers are calibrated but not explained, and its accuracy on this task has not been
  measured beyond the vendor's figures. The threshold, the guards and the log exist so the usage
  review can catch a wrong tier before it becomes a habit.
- `effort` is set per agent or skill definition (`effort:` in the frontmatter) and per workflow
  `agent()` call; a caller's explicit `model` still overrides an agent's frontmatter, which is why the
  policy asks not to raise a `model-router:*` worker's model unless its Sonnet result failed.
