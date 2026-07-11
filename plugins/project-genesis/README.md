# project-genesis

AI-native project bootstrapping. One skill for now:

- **genesis** — start a new app from scratch the AI-native way: a short structured
  interview, a minimal stack-appropriate scaffold that actually runs, and a lean set of
  foundation docs (`CLAUDE.md` agent contract + `docs/PRODUCT|ARCHITECTURE|DECISIONS|CONVENTIONS.md`)
  written *for future LLM sessions*, with maintenance rules embedded so they stay true.

## Why

Documentation used to rot because humans wouldn't read it. Now the docs are the operating
system future agent sessions program against — exhaustive, current-state, constraint-heavy
context finally has a consumer. Agents don't build projects this way by default (their
training data predates the pattern); this skill makes them.

## Install

From the `claude-skills` marketplace:

```
/plugin install project-genesis@claude-skills
```

Then in an empty directory: ask Claude to "start a new project" (or invoke
`/project-genesis:genesis`).

## Future skills (not yet built)

- `retrofit` — bring an existing codebase up to the AI-native doc standard.
- `doc-health` — audit a genesis-born project for doc drift.
