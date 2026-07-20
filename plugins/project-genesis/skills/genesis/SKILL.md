---
name: genesis
description: Bootstrap a brand-new app the AI-native way — interview the user, then generate the foundation docs (CLAUDE.md agent contract, product/architecture/decisions/conventions) plus a minimal stack-appropriate scaffold with CI. The docs are designed as the operating system for future agent sessions, with embedded maintenance rules that keep them true. Use when starting a new project or app from scratch, or setting up a greenfield repo. Trigger phrases: "new project", "start an app", "from scratch", "scaffold", "greenfield", "bootstrap", "set up the foundation".
---

# Genesis

In AI-native development, the project's docs are the interface future agent sessions program
against: exhaustively documented context finally has a consumer that reads all of it. You (the
agent) will not build projects this way by default — your instincts come from training data that
predates the pattern. Follow the phases below; do not skip ahead to writing code.

## Paths

```bash
SK="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/genesis}"
[ -d "$SK" ] || SK="$HOME/.claude/skills/genesis"
```

## The foundation set

Every generated doc must answer: *what would a fresh LLM session need that it can't get from the
code?* And no doc exists without a maintenance rule that keeps it alive.

| File | What a future agent gets from it |
|---|---|
| `CLAUDE.md` | The contract: project identity, verified commands, hard restrictions, a **doc map** with "read X before touching Y" pointers, and the maintenance rules. The index to everything. |
| `docs/PRODUCT.md` | Intent code can't express: users, v1 scope, **non-goals** (the highest-value section — prevents scope drift), open questions. |
| `docs/ARCHITECTURE.md` | Current-state system shape only: stack with one-line whys, module map, data flow, entry points, "where changes go". |
| `docs/DECISIONS.md` | Append-only decision log (`## NNNN — Title`, Context/Decision/Consequences, 5–10 lines). Never edited — superseded. Seeded at genesis with the stack choice. |
| `docs/CONVENTIONS.md` | Only non-obvious, project-specific rules, plus a **Restrictions** section. Not a linter-config restatement. |

Optional: `docs/GLOSSARY.md` — only when the domain has ≥5 terms an LLM would misread.
Deliberately excluded: ROADMAP (rots; lives in the issue tracker), CHANGELOG (git is the
changelog), a separate docs index (CLAUDE.md's doc map is the index), per-module READMEs at
genesis time (speculative).

## Template mechanics

Templates live in `$SK/templates/`. Three kinds of content:

- `{{placeholder}}` — fill with synthesized content.
- `<!-- genesis: ... -->` comments — instructions to you (quality bar, length budget, what to
  omit). **Delete them after filling.** A shipped doc must contain none.
- Plain prose — ships verbatim. Notably the maintenance-rules block and doc-map skeleton in
  `CLAUDE.template.md`, and the format header in `DECISIONS.template.md`. Do not paraphrase these.

## Phase 0 — Situate

Look at the directory. Truly empty (or only a README/.git) → proceed. Existing code → say so and
switch to the lighter retrofit path: skip scaffolding, derive ARCHITECTURE/CONVENTIONS from
reading the code, and interview only for product intent and restrictions. (A full retrofit skill
is future work; keep it lightweight.)

## Phase 1 — Interview

Run the question bank in `$SK/interview.md` via `AskUserQuestion` — up to 4 questions per call,
max 3 rounds. Rules: never ask what the user already said; every technical question offers a
"recommend for me" option; anything still unknown after round 3 becomes an **Open questions**
entry in PRODUCT.md, not a fourth round.

## Phase 2 — Synthesize

Draft `docs/PRODUCT.md` and the first `docs/DECISIONS.md` entries (stack choice with reasoning,
hosting, key constraints). Then **show the user the non-goals and the decisions and get
confirmation before writing anything else** — this is the cheapest moment to correct course.

## Phase 3 — Scaffold

Stack-appropriate, minimal, running:

- Prefer the stack's official generator (`npm create vite`, `cargo new`, `uv init`, …) over
  hand-rolling — but hand-roll when no generator fits (e.g. a single-file stdlib project); a
  generator is not worth an extra dependency.
- Version control per the interview's Q11 answer — never assumed:
  - **No git** (scratch project): skip init, commits, and CI entirely; record the choice in
    `docs/DECISIONS.md` so a future session doesn't "fix" it.
  - **Local git only**: `git init` + a proper `.gitignore` (if not already a repo); no remote,
    no CI file — record CI under Open questions.
  - **Git + remote** (GitLab/GitHub): init as above, then create the remote with the forge CLI
    (`glab repo create` / `gh repo create`) and set `origin`. If the CLI is missing or
    unauthenticated, fall back to local-git-only, tell the user, and record the remote as an
    Open question.
- Formatter, linter, and test runner configured — where the stack and the user's restrictions
  allow. If a tool would violate a restriction (e.g. "no third-party deps"), skip it, use the
  closest built-in check, and record the gap in CONVENTIONS.md. **At least one passing test,
  sized to the interview's testing-appetite answer** — one trivial test is the floor, not the
  target.
- CI on the platform from the interview, running lint + test on push — **only when a remote
  exists**; a workflow file that can never run is a false claim in the repo. Otherwise create
  no CI config and record it under Open questions.
- `.env.example` if the app needs secrets; never commit real values.
- **Scaffold the smallest thing that runs, not a folder museum** — no empty `utils/`, `services/`
  directories awaiting a future that may differ.

Verify: run the app, the tests, and whatever lint/check exists, once each. Then, if git is in
play, make the initial commit (e.g. "genesis scaffold") — unless the user has asked to review
first — and push if a remote was created, confirming CI goes green (or reporting why not).

## Phase 4 — Document what exists

Only now write `docs/ARCHITECTURE.md` and `docs/CONVENTIONS.md`, describing the *actual*
scaffold — so the docs start true. Add `docs/GLOSSARY.md` only if the threshold above is met.

## Phase 5 — Generate CLAUDE.md

Fill `CLAUDE.template.md`. Commands go in only after you have run them successfully in this
session. Restrictions come only from the interview — never invent constraints. The maintenance
rules and doc-map structure ship verbatim.

## Phase 6 — Cold-start test

Re-read only the generated docs, as if you were a fresh session with zero context, and check:

1. Does CLAUDE.md alone tell me how to run and test the app?
2. Can I tell what NOT to build (non-goals, restrictions)?
3. For a sample change ("add an endpoint/screen"), do the docs say where it goes?
4. Is every claim in the docs currently true? (Mechanical version: re-run every command in
   CLAUDE.md verbatim; diff the module map against the real tree.)
5. Is every doc in the doc map, and covered by a maintenance rule? Any leftover
   `{{placeholder}}` or `<!-- genesis: -->` comment?

Fix failures, then summarize for the user: files created, decisions recorded, open questions.

## What makes a doc LLM-useful

- Current state only — history lives in git.
- Explicit constraints beat descriptions ("never X" outperforms three paragraphs about X).
- "Read this before touching Y" pointers route attention where it matters.
- Retrieval-friendly headings — a section findable by its name alone.
- Short enough to be read whole; a doc too long to load fully is a doc that gets skipped.

## Anti-patterns

- **No speculative docs** — never document features, modules, or scaling plans that don't exist
  yet; aspirational architecture is worse than none, because a future agent will trust it.
- **Don't duplicate the code or the tools** — no API dumps, no restating linter config, no
  directory listings `ls` gives for free.
- **No doc without a keeper** — a doc outside the doc map with no maintenance rule is future
  misinformation.
- **No history in docs** — no "previously", "recently we", or migration narratives.
- **Don't pad the interview** — unknowns become open questions, not interrogation.
- **Don't invent constraints** — restrictions come from the user; your recommendations are
  recorded as decisions with reasoning, not silent rules.
