---
name: setup
description: One-time per-machine setup for the model-router plugin - makes subagents spawned without an explicit model default to Sonnet, turns on auto-update for the claude-skills marketplace, and stores the Jev (OpenRouter) key the decider hooks read. Use after installing model-router on a machine, when the session-start note says setup has not been run, or when it says the Jev decider is inactive.
---

# Setup (run once per workstation)

A plugin cannot set environment variables or hold secrets, so these go into this machine's home.

1. Show the user what will change, then run:

   ```sh
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/setup.py"
   ```

   It merges `env.CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` and
   `extraKnownMarketplaces.claude-skills.autoUpdate = true` into `~/.claude/settings.json`, keeps
   every other key, writes a timestamped backup next to the file, and is safe to run again.
   `--dry-run` prints the result without writing.
2. The Jev decider needs a key. Ask the user for an OpenRouter key (no waitlist; `typesafe/jev-1.13`
   is billed per input token at $0.042 per million, output free) or a TypeSafe key
   (`console.typesafe.ai`, early access). Never paste the key into the conversation or into
   settings.json; have the user write it themselves:

   ```sh
   mkdir -p ~/.claude/model-router && umask 077 && printf 'OPENROUTER_API_KEY=%s\n' '<key>' > ~/.claude/model-router/jev.env
   ```

   (`TYPESAFE_API_KEY=` for the direct route.) Then check it with one live call, which also proves
   the model answers sanely (a "poll the pipeline" task must come back `haiku`):

   ```sh
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/jev.py" --check
   ```

   Optional knobs live in `~/.claude/model-router/jev.json`: `threshold` (default 0.8), `timeout`
   (4 s), `route_spawns` and `advise_prompts` (true), `max_state_chars` (6000), `samples_keep`
   (10: the last exchanges kept verbatim for `jev.py --samples`).
3. Tell the user the env var and the key apply to **new** sessions; this session keeps its old value.
4. In a new session, check the wiring: spawn a general-purpose agent with `model: opus` and the prompt
   "Poll pipeline 1 until it finishes", and confirm the tool result carries a `[model-router]` line
   and that

   ```sh
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/jev.py" --explain 3
   ```

   shows the spawn re-tiered to haiku. If Claude Code was upgraded since, re-run
   `scripts/verify_hook.sh` first: it proves in four throwaway sessions that a hook can still change
   a subagent's model (the fact the decider rests on).
5. Record this workstation's first usage review, so the two-weekly schedule starts now. Run
   `/model-router:usage-review`, passing the install date as `--since` when it asks. Until that
   review exists, every new session reminds you to run it.
