---
name: skill-retro
description: Session retrospective for skills — review the skills and plugins used in the current session, grade their perceived performance with evidence from the session itself, append findings to each skill's FEEDBACK.md, and propose concrete user-approved SKILL.md refinements. Run at the end of a working session or on demand. Trigger phrases: "skill retro", "session retro", "review this session", "review the skills", "how did the skills perform", "skill feedback", "refine the skills we used", "rate the skills".
---

# Skill retro

A skill is a set of instructions tested only by real sessions, and the evidence of how it
performed evaporates when the session ends. You — the agent that just used it — are the
instrument: you know where instructions were ambiguous, where you improvised, where the user
corrected you. Capture that while it's in context, and turn it into refinements.

## Paths

```bash
SK="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/skill-retro}"
[ -d "$SK" ] || SK="$HOME/.claude/skills/skill-retro"
# The user's editable skills checkout (feedback + edits go HERE, never the plugin cache):
REPO="${SKILLS_REPO:-}"
[ -n "$REPO" ] || for d in "$HOME/Desktop/personal/projects/claude-skills" \
                           "$HOME/projects/claude-skills" "$HOME/claude-skills"; do
  [ -d "$d/.claude-plugin" ] && REPO="$d" && break
done
```

If `$REPO` resolves to nothing, ask the user where their skills checkout lives — once — and use
that answer for the rest of the retro.

## Phase 1 — Inventory

Scan the session (your own context; note if earlier parts were compacted away and review only
what you can still see or reliably remember):

- Every skill invoked — `Skill` tool calls, slash commands, and skills you followed because
  their instructions were loaded (e.g. a SKILL.md you read and executed).
- Subagent/template/script usage that a skill drove.
- **Misses**: moments a skill existed that should have triggered but didn't — the user asked in
  words the description didn't match, or you did the work manually. Discoverability failures
  are findings too.

If nothing qualifies, say so, review the misses only, and stop — do not invent a retro.

## Phase 2 — Evidence

For each inventoried skill, collect concrete session moments in these categories. **Evidence or
it didn't happen** — every claim cites what actually occurred; no hypotheticals.

- **Followed** — instruction worked as written, outcome good.
- **Ambiguous** — you had to interpret; note the reading you chose.
- **Missing** — no instruction covered the situation; note what you improvised.
- **Contradiction** — two instructions (or an instruction and a user constraint) collided.
- **Wrong** — followed as written, produced a bad result or rework.
- **User correction** — the user redirected the outcome. Gold-standard signal; weight heaviest.

Then classify each friction point's fault before blaming the skill:
**skill-fault** (instructions caused it) / **agent-fault** (you deviated or misread — grade your
own adherence honestly) / **scope-change** (user redirected for reasons no skill could know).
Only skill-faults justify proposing edits.

Before classifying, **re-read the target skill's current SKILL.md and templates** — your session
memory may predate fixes. A friction already fixed upstream is recorded as "since fixed", never
re-proposed.

## Phase 3 — Assess

Per skill, a verdict block: overall **1–5 rating** with a one-line justification, plus one line
each for: **discoverability** (did it trigger when it should; "n/a" if invoked deliberately),
**clarity**, **completeness**
(coverage of what the session actually needed), **outcome** (quality of what it produced). A
skill that performed fine gets one line — "no friction" — not invented findings.

Read the skill's existing `FEEDBACK.md` (if any) before finalizing: a friction point recurring
across sessions escalates from "note it" to "restructure the section", and a past proposed-edit
that never landed is worth re-raising.

## Phase 4 — Record

Resolve each skill's **editable source** and append a dated entry (format:
`$SK/templates/FEEDBACK.template.md`):

1. Resolve symlinks to the skill's real directory. If it's under a plugin cache
   (`~/.claude/plugins/...`), map it to the checkout: `$REPO/plugins/<plugin>/skills/<name>/`.
2. Writable checkout or standalone git-managed skill folder → append to `FEEDBACK.md` next to
   its SKILL.md (create from the template header if missing — everything above the entry
   heading, including the retro boundary comment).
3. External/vendored/read-only (e.g. marketplace `source: url` skills) → append to
   `$REPO/reviews/external/<skill-name>.md` instead.

Entries are **append-only and dated** — never rewrite past feedback; supersede it in a new
entry. One exception: write proposal outcomes as "pending" at record time, and flipping your
new entry's own outcome lines (pending → applied/rejected) after the user decides is not a
rewrite. Never write into the plugin cache: it is volatile and overwritten on update.

## Phase 5 — Propose refinements

For each skill-fault, propose a **minimal concrete edit**: quote the current line(s), show the
replacement (or the section to add), one line of rationale tied to the evidence. Keep proposals
conformant to the authoring standard in `../skill-author/STANDARDS.md` (description carries
discovery; skimmable numbered spine; bounded loops; detail out of the main flow) — a fix that
degrades structure or readability isn't a fix. Rank by impact;
lead with anything a user correction motivated. Then **stop and present the proposals — apply
only what the user approves**, as edits to the checkout (suggest commit message
`retro(<skill>): <what>`). Record the outcome (applied / pending / rejected) in the FEEDBACK
entry.

## Rules

- **One session ≠ a redesign.** Propose the smallest edit that removes the friction; wholesale
  rewrites need a recurring theme across FEEDBACK entries.
- **Grade yourself too.** If you deviated from a skill, the finding is your adherence, not the
  skill — unless the skill made deviation attractive (that IS a finding).
- **Misses are findings.** A skill that never triggered when it should have gets a
  discoverability proposal (usually: add the user's actual words to its trigger phrases).
- **Don't review the untouched.** Skills merely installed but unused this session are out of
  scope.
- **The user's words are data.** Corrections, rephrasings, and "no, I meant…" moments are the
  highest-value evidence in the session — quote them.
