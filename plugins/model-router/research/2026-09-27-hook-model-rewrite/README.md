# Can a hook change a subagent's model? (2026-09-27, Claude Code 2.1.283, Linux)

The public hooks reference and two issues (anthropics/claude-code #44412, closed as duplicate;
#69545, closed "not planned", tested on 2.1.183) say a `PreToolUse` hook cannot change
`tool_input.model` for the Agent tool. Measured here, it can. This is the fact the Jev decider
in 0.4.0 rests on, so the raw hook payloads are kept next to it.

Method: `claude -p --model haiku --settings settings.example.json --allowedTools Agent` with a
prompt asking for exactly one `general-purpose` spawn. The hook logged its stdin and, when told
to, returned `updatedInput` with the whole `tool_input` and `model` replaced. The model the
subagent ran on is the `message.model` of the first assistant turn in its transcript.

| run | caller requested | hook rewrote to | subagent ran on | file |
|---|---|---|---|---|
| hooks.jsonl | sonnet | haiku | claude-haiku-4-5-20251001 | run.result.json |
| ctrl_rewrite_up | haiku | sonnet | claude-sonnet-5 | ctrl_rewrite_up.result.json |
| ctrl_rewrite_opus | haiku | opus | claude-opus-5-5 | ctrl_rewrite_opus.result.json |
| ctrl_no_rewrite | sonnet | (none) | claude-sonnet-5 | ctrl_no_rewrite.result.json |

Also measured:

- `PreToolUse(matcher: "Agent")` fires on every spawn and receives `subagent_type, description,
  prompt, model, run_in_background` (hooks.jsonl, ups.jsonl).
- `SubagentStart` fires with `agent_id` and `agent_type` only; its `additionalContext` reaches the
  subagent transcript.
- A Workflow script's `agent()` calls do NOT pass through `PreToolUse(Agent)`; they fire
  `SubagentStart` with `agent_type: "workflow-subagent"` and an empty input (wf.jsonl). Workflow
  stages therefore stay a policy rule (set `model` on every `agent()` call).
- `fork` is not available in `-p` sessions; interactively it inherits the parent model and ignores
  `model`, so the router skips it.
- `UserPromptSubmit` receives the prompt text; its `additionalContext` is injected (ups.jsonl).

Session and transcript paths were stripped from the logs. Each run cost about $0.02 to $0.04.
Re-run with `scripts/verify_hook.sh` after every Claude Code upgrade; if the "ran on" column stops
matching the "rewrote to" column, the decider must fall back to advisory mode.
