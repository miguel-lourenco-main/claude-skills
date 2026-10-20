---
name: skill-author
description: Create new Claude Code skills, or audit/restructure existing ones, against this marketplace's authoring standard (STANDARDS.md) — so every skill is discoverable by the model AND readable by the human maintaining it. Use when the user says "create a skill", "new skill for X", "write a SKILL.md", "turn this workflow into a skill", "lint/audit my skill", "make this skill readable", or "restructure this skill". Covers placement (personal / project / plugin), plugin manifest wiring, and the readability/structure checklist. NOT for reviewing how skills performed in a session (use skill-retro — it feeds this skill's standard with real-usage evidence).
---

# Skill author

Skills fail in two ways: the model can't find them (bad description), or the human can't
maintain them (unreadable wall of instructions). This skill front-loads both concerns. The
rules live in one place — **`STANDARDS.md` beside this file — read it now**; this file is the
workflow that applies it.

```bash
SA="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/skill-author}"
[ -d "$SA" ] || SA="$HOME/.claude/skills/skill-author"
STANDARDS="$SA/STANDARDS.md"; ls "$STANDARDS" || echo "STANDARDS.md NOT FOUND"
# The user's skills checkout (plugin skills are edited HERE, never in the plugin cache):
REPO="${SKILLS_REPO:-}"
[ -n "$REPO" ] || for d in "$HOME/Desktop/workspace/personal/projects/claude-skills" \
                           "$HOME/projects/claude-skills" "$HOME/claude-skills"; do
  [ -d "$d/.claude-plugin" ] && REPO="$d" && break
done
```

## Mode A — Create a skill

**1 · Interview before writing.** Pin down, in the user's words: the job (one workflow — if
two emerge, propose two skills), the trigger phrases they'd actually type, what the skill
reads/writes and where, what it must NOT do, and any assets (scripts, templates) it needs.
The user's phrasing goes verbatim into the description — that is what makes discovery work.

**2 · Place it.** Personal (`~/.claude/skills/<name>/`) for cross-project personal workflow;
project (`<project>/.claude/skills/<name>/`) for one-repo needs; plugin
(`$REPO/plugins/<plugin>/skills/<name>/`) when it should install/update via the marketplace.
Fit it into an existing plugin's theme before proposing a new plugin.

**3 · Draft against the standard.** Write the SKILL.md following `STANDARDS.md` sections A–D:
description carries the discovery load (A2), numbered skimmable spine (B2), paths + graceful
degradation first (B3), delegate to neighboring skills instead of restating them (B4), cap
every loop (B5), push code into `assets/`/`scripts/` and detail into `references/` (B6, B7).
Prefer a working template asset the skill customizes over prose telling the agent to generate
code from scratch — test any shipped script actually runs.

**4 · Wire it (plugin skills only).** Add the skill to the plugin `README.md`; bump the version
in BOTH `plugin.json` and `.claude-plugin/marketplace.json` (minor bump for a new skill). Then
tell the user the deploy steps: push → `/plugin marketplace update` → `/plugin update` → restart.

**5 · Self-audit before delivering.** Run Mode B on the draft. Fix what it finds. Show the
user the description separately from the body — it's the part worth their review.

## Mode B — Audit / restructure an existing skill

**1 · Read the whole skill** — SKILL.md, its assets/templates, its FEEDBACK.md (recurring
friction there outranks any style rule).

**2 · Check against `STANDARDS.md` rule by rule**, and apply its 60-second test (C5)
honestly: headers + first lines only — can a stranger say what it does, when it triggers,
what it writes where?

**3 · Report in the standard's audit format** (rule-tagged findings, ordered by reader
impact, top-3 fixes last). For a restructure request, then apply fixes the user approves —
smallest edits that remove the violations, in the checkout, never the plugin cache. Preserve
FEEDBACK.md and the skill's voice; the standard makes skills readable, not identical.

## Rules

- **The description is the product.** Spend disproportionate effort on A2; a perfect body
  behind a bad description never runs.
- **Don't create near-duplicates.** Before Mode A, check installed skills for one that
  already covers the job — extending it usually beats a new skill.
- **Standards evolve by evidence.** When session evidence (via skill-retro) contradicts a
  rule in STANDARDS.md, propose a standards edit — don't silently deviate.
