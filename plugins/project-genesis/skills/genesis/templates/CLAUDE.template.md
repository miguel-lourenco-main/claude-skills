# {{project-name}}

<!-- genesis: one paragraph, 2-4 sentences: what the app is, who it's for, the current phase
(e.g. "pre-v1, walking skeleton"). No marketing tone. -->
{{identity-paragraph}}

## Commands

<!-- genesis: only commands you have RUN successfully in this session. Include setup, run,
test, lint/format, and deploy if it exists. One line each, exact invocation. Delete lines for
categories that don't exist in this project; for setup-free stacks note "# no setup needed". -->
```bash
{{setup-command}}        # first-time setup
{{run-command}}          # run the app
{{test-command}}         # run tests
{{lint-command}}         # lint + format
```

## Restrictions

<!-- genesis: hard "never do X" rules, ONLY from the interview — never invented. If the user
gave none, keep the section with the single line "None recorded yet — propose additions to the
user, don't assume." These rules may only be changed on explicit user instruction. -->
{{restrictions-list}}

## Doc map

Read the relevant doc **before** working in its territory; each doc is short enough to read whole.

| Doc | What it holds | Read before |
|---|---|---|
| `docs/PRODUCT.md` | Users, v1 scope, non-goals, open questions | Adding or changing any feature |
| `docs/FEATURES.md` | Feature ledger: in progress / planned / implemented, with Next: pointers | Starting any session's work — resume from "In progress" |
| `docs/ARCHITECTURE.md` | Stack, module map, data flow, where changes go | Touching code structure |
| `docs/DECISIONS.md` | Append-only log of choices that constrain future work | Adding a dependency, changing a pattern |
| `docs/CONVENTIONS.md` | Project-specific rules + testing policy | Writing any code |
<!-- genesis: add a GLOSSARY row only if the file exists. Delete this comment. -->

## Maintenance rules

These keep the docs true. They are the contract of this repo — follow them in every session.

1. **Docs describe the current state only.** Git history is the changelog — never write
   "previously", "we changed from", or dated narratives into docs.
2. **Decision → DECISIONS.md, same commit.** Any choice that constrains future work (dependency
   added, schema/API shape, tool swap, pattern adopted) gets an appended entry. Never edit
   existing entries — supersede with a new one.
3. **Module map stays true.** Adding, removing, renaming, or repurposing a top-level module or
   directory requires updating ARCHITECTURE.md in the same change.
4. **Commands stay runnable.** If setup, run, test, or deploy commands change, update the
   Commands section above and verify the new command actually runs.
5. **New rules live in CONVENTIONS.md, not in your head.** When you adopt a convention (or
   knowingly break one), record it. The Restrictions section above may only be changed by
   explicit user instruction.
6. **Before ending a session that changed code:** re-check the docs your diff touches on; if a
   doc now lies, fix it in the same commit. Never create a new doc file unless a rule here will
   keep it alive.
7. **Feature lifecycle lives in FEATURES.md.** Starting or finishing a feature moves its entry
   (Planned → In progress → Implemented) in the same commit; an In-progress entry always
   carries a current "Next:" pointer — update it before ending the session. New features enter
   as Planned only after the user confirms them against PRODUCT.md's non-goals.
