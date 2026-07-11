# Feedback — genesis

Append-only log of session retrospectives for this skill, written by `skill-retro`. Newest
entry last. Never edit past entries — supersede them in a new one. A friction point appearing
in 2+ entries justifies a structural edit, not another note.

<!-- retro: everything below this line is the ENTRY format — append one per retro, delete
nothing above. Fill all placeholders; cite real session moments, no hypotheticals. -->

## 2026-07-11 — Bootstrapped a stdlib-only Python CLI expense tracker in a scratch dir (pre-supplied interview answers, autonomous run)

- **Trigger:** read-and-followed (deliberate invocation; phases 2–6 executed, interview answers pre-baked)
- **Verdict:** 4 — executable end-to-end and shipped a green scaffold with true docs, but session-time Phase 3 needed four improvisations under the "no third-party dependencies" restriction (all but one since fixed upstream).
- **Discoverability:** n/a — invoked deliberately, not via trigger-phrase matching; no signal either way.
- **Clarity:** Phases 2, 4, 5, 6 clear and executable as written; Phase 3 as it existed at session time required interpretation on tooling, generators, commit, and CI branches.
- **Completeness:** Phase 6 checklist fully covered verification (all 5 cold-start checks passed); session-time gaps in Phase 3 (restriction-aware tooling fallback, initial commit, CI-none branch) are all present in the current SKILL.md.
- **Outcome:** Working app, 4 green unittest tests, zero leftover {{placeholders}} or `<!-- genesis: -->` comments, docs true at cold-start.
- **Worked:**
  - Phase 2's confirm-non-goals-and-decisions-before-writing gate, Phase 4's document-what-exists ordering, Phase 5's commands-only-after-running rule, and the Phase 6 cold-start checklist all performed as written.
  - Template mechanics (placeholder / genesis-comment / verbatim-prose distinction) were unambiguous; shipped docs came out clean.
- **Friction:** (each point re-verified against the current SKILL.md and templates before classifying)
  - skill-fault, since fixed: "Formatter, linter, and test runner configured" was unconditional at session time and collided with the user restriction "no third-party dependencies" (stdlib Python has no linter); improvised `python3 -m compileall -q .`. Current Phase 3 now carries the fallback ("skip it, use the closest built-in check, and record the gap in CONVENTIONS.md") — already addressed.
  - skill-fault, since fixed: "Prefer the stack's official generator" listed `uv init` (itself a third-party tool) with no guidance on when hand-rolling is acceptable. Current line adds "hand-roll when no generator fits (e.g. a single-file stdlib project); a generator is not worth an extra dependency" — already addressed.
  - skill-fault, since fixed: CLAUDE.template.md's Commands block hard-coded 4 placeholder lines while its genesis comment said "only commands you have RUN"; ambiguous when a category doesn't exist. Comment now says "Delete lines for categories that don't exist in this project; for setup-free stacks note '# no setup needed'" — already addressed.
  - skill-fault, since fixed: no instruction to make the initial commit; the session's repo ended at `git init` with everything untracked. Phase 3 now ends "Then make the initial commit (e.g. 'genesis scaffold') — unless the user has asked to review first" — already addressed.
  - skill-fault, since fixed: the "CI: none yet → no CI file, record as open question" branch was absent from SKILL.md and had to be derived from interview.md. Phase 3 now states it explicitly — already addressed.
  - skill-fault, open: Phase 3's "**One trivial passing test.**" tensions with interview.md Q10 ("Testing appetite? Minimal smoke tests / solid unit coverage on core logic / strict TDD"); the session's answer "minimal but real — core logic covered" justified 4 tests, and the interview answer was followed over the SKILL.md line. Still verbatim in the current SKILL.md.
  - No user corrections occurred (autonomous run with pre-supplied answers) — no gold-standard signal this session.
- **Proposed edits:**
  - Frictions 1–5: none — already addressed upstream after this session; no duplicate proposals raised.
  - Friction 6: applied — Phase 3 now reads "At least one passing test, sized to the interview's testing-appetite answer — one trivial test is the floor, not the target."
