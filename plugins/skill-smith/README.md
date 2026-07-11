# skill-smith

Meta-tooling for developing and refining Claude Code skills. One skill for now:

- **skill-retro** — a session retrospective. Reviews the skills/plugins used in the current
  session, grades how they actually performed (with evidence from the session, not vibes),
  appends dated findings to each skill's `FEEDBACK.md` in your skills checkout, and proposes
  concrete SKILL.md edits for you to approve.

## Why

A skill is a set of instructions tested only by real sessions — and the evidence of how it
performed (ambiguous steps, missing branches, instructions the agent had to improvise around,
moments the user corrected course) evaporates when the session ends. skill-retro captures that
evidence while the agent that lived it still has it in context, and turns recurring friction
into deliberate refinements.

## Install

```
/plugin install skill-smith@claude-skills
```

Then, at the end of a working session (or any time): "run a skill retro" / "review how the
skills performed this session", or invoke `/skill-smith:skill-retro`.

## Future skills (not yet built)

- `skill-lint` — static review of a SKILL.md against known good patterns (triggers, budget,
  template mechanics) without needing a session.
- `skill-new` — bootstrap a new skill folder from the conventions in this marketplace.
