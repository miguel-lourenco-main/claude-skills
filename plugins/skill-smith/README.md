# skill-smith

Meta-tooling for developing and refining Claude Code skills. Two skills:

- **skill-author** — creates new skills and audits/restructures existing ones against the
  authoring standard in `skills/skill-author/STANDARDS.md`: discoverable descriptions (the
  user's own trigger words), a skimmable numbered structure, human-readable prose, bounded
  loops, assets out of the prose, and correct plugin/marketplace wiring. Covers the
  `skill-new` + `skill-lint` roles in one place.
- **skill-retro** — a session retrospective. Reviews the skills/plugins used in the current
  session, grades how they actually performed (with evidence from the session, not vibes),
  appends dated findings to each skill's `FEEDBACK.md` in your skills checkout, and proposes
  concrete SKILL.md edits for you to approve — kept conformant to the authoring standard.

## Why

A skill is a set of instructions with two audiences: the model that must *find and follow* it,
and the human who must *maintain* it. skill-author front-loads both at creation time;
skill-retro captures the evidence of how skills actually performed while the agent that lived
the session still has it in context. The standard sits between them: authoring applies it,
retros pressure-test it.

## Install

```
/plugin install skill-smith@claude-skills
```

Then: "create a skill for X" / "audit this skill" (`/skill-smith:skill-author`), and at the end
of a working session "run a skill retro" (`/skill-smith:skill-retro`).
