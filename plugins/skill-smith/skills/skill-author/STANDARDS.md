# Skill authoring standard

What "human readable and well structured" means for skills in this marketplace, stated as
checkable rules. `skill-author` enforces this on creation and on audit; `skill-retro` keeps
proposed edits conformant to it. When a rule and good judgment collide, judgment wins — but
say so in the skill's FEEDBACK.md.

## A · Frontmatter

- **A1** `name`: kebab-case, matches the folder name, says what it does (`style-tweaker`,
  not `helper2`).
- **A2** `description` carries the full discovery load, in this order: (1) what the skill
  does in one sentence, (2) when to use it, (3) **trigger phrases quoted in the user's own
  words**, (4) a `NOT for` boundary pointing to the neighboring skill that covers it. This is
  the only part the model sees before invoking — everything needed to choose correctly goes here.
- **A3** No other frontmatter keys unless the harness requires them.

## B · Structure

- **B1 One job.** A skill does one workflow. Two loosely-related workflows = two skills.
  Shared knowledge goes in a reference file, not a second wing of the SKILL.md.
- **B2 Skimmable spine.** Numbered sections (`## 1 · Verb phrase`) in execution order; a human
  reading only the headers should reconstruct the workflow in under a minute.
- **B3 Paths block first.** If the skill touches its own assets or a repo, section 0/first
  section resolves paths (`$CLAUDE_PLUGIN_ROOT` with a personal-skills fallback) in one
  runnable block, and states graceful degradation for anything missing.
- **B4 Delegation principle.** Reference other skills' behavior, never restate their content.
  Restated rules go stale; invocations don't.
- **B5 Bounded loops.** Any retry/grow/search loop states its termination cap in the skill
  itself ("at most twice per request"). No open-ended "repeat until good".
- **B6 Assets out of the prose.** Runnable code → `scripts/` or `assets/` (customize-a-config
  templates beat generate-from-scratch instructions). Fill-in documents → `templates/`. Deep
  detail the main flow doesn't need → `references/` or a named `.md` beside the SKILL.md,
  linked at the point of use.
- **B7 Right-sized.** SKILL.md target ≤ ~150 lines. Past that, push detail into B6 files.
  A skill that needs 400 inline lines is usually two skills or one skill plus references.

## C · Human readability

The SKILL.md is read by two audiences — the agent executing it and the human maintaining it.
Rules for the second audience, who is easy to forget:

- **C1 Why before how.** Each section opens with a sentence of intent before commands.
  A maintainer must be able to tell *what breaks* if they delete a line.
- **C2 Plain prose.** Short sentences, active voice, no wall-of-text: nothing over ~5 lines
  without a break, list, or code block. Terms of art defined at first use.
- **C3 Runnable blocks.** Every code block is copy-paste runnable as written (or explicitly
  marked as a fragment). Env-dependent values become variables set at the top.
- **C4 Honest examples.** Example invocations/outputs reflect what actually happens — update
  them when behavior changes; a stale example is worse than none.
- **C5 The 60-second test.** A person who has never seen the skill reads only headers +
  first lines: can they say what it does, when it triggers, and what it writes where?
  If not, restructure before polishing sentences.

## D · Behavior contracts

- **D1 Read-only vs mutating is explicit.** Skills that change things state their default mode
  and their confirmation gate. Destructive steps are separate, named, and gated.
- **D2 State goes to stated places.** Every file the skill writes is named in the skill
  (which dir, which format). Never write into plugin caches; route to the user's checkout.
- **D3 Degrade, don't die.** Missing optional dependency → reduced mode + tell the user,
  not a dead end.

## E · Plugin/marketplace mechanics (when the skill ships in a plugin)

- **E1** Skill listed in the plugin `README.md` with a one-liner matching its description.
- **E2** Version bumped in BOTH `plugin.json` and the marketplace `marketplace.json` on any
  skill change (minor for new skills/modes, patch for fixes).
- **E3** A `FEEDBACK.md` may sit beside SKILL.md (created by skill-retro) — never delete it
  during restructures; it is the skill's memory.

## Audit output format

When auditing, report per rule-violation: `[B2] <file>: <one-line finding> → <one-line fix>`,
ordered by reader impact (broken discovery A2 > structure B > prose C), and end with the
3 highest-leverage fixes. Don't nitpick conformant-but-different style — the standard exists
to make skills readable, not identical.
