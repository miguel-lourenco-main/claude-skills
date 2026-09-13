---
name: setup
description: One-time per-machine setup for the model-router plugin - makes subagents spawned without an explicit model default to Sonnet and turns on auto-update for the claude-skills marketplace so policy changes reach this workstation. Use after installing model-router on a machine, or when the session-start note says setup has not been run.
---

# Setup (run once per workstation)

A plugin cannot set environment variables, so these two settings go into this machine's
`~/.claude/settings.json`.

1. Show the user what will change, then run:

   ```sh
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/setup.py"
   ```

   It merges `env.CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` and
   `extraKnownMarketplaces.claude-skills.autoUpdate = true` into the existing JSON, keeps every other
   key, writes a timestamped backup next to the file, and is safe to run again. `--dry-run` prints the
   result without writing.
2. Tell the user the env var applies to **new** sessions; this session keeps its old value.
3. In a new session, check it: spawn a general-purpose agent with no `model` and a trivial prompt, then
   confirm with

   ```sh
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/analyze.py" --since today --last-subagents 3
   ```

   that its model is Sonnet. An explicit `model` on a spawn, or `model:` in an agent's frontmatter,
   still takes precedence.
4. Record this workstation's first usage review, so the two-weekly schedule starts now. Run
   `/model-router:usage-review`, passing the install date as `--since` when it asks. Until that
   review exists, every new session reminds you to run it.
