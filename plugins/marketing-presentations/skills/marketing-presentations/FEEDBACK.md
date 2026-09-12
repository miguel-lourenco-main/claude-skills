# Feedback — marketing-presentations

Append-only log of session retrospectives for this skill, written by `skill-retro`. Newest
entry last. Never edit past entries — supersede them in a new one. A friction point appearing
in 2+ entries justifies a structural edit, not another note.

<!-- retro: everything below this line is the ENTRY format — append one per retro, delete
nothing above. Fill all placeholders; cite real session moments, no hypotheticals. -->

## 2026-09-08 — job-hunt-hub landing craft pass (build mode, brand-constrained)

**Task.** Improve an existing Next.js marketing route (`/`, the Expedition sheet) using the
skill, inside the app's design world; package the skill as this plugin in the same session.

**Perceived performance: 8/10.** The build flow (register → script → implement → bounded
verify) produced a page with the craft signals the knowledge base names — monumental type
ladder, one entrance verb, belief and climax rooms, a bookend, performed numbers, a reacting
header — without breaking the world's tokens, colour budget or reduced-motion rule. The
script's arithmetic audit was wrong twice (assumed glyph widths), caught only by rendering.

**Friction.**
- The SKILL.md and `implementation.md` assumed a standalone single-file page; nothing said
  how to apply the method to an existing component tree. Added `implementation.md` §7.
- The Playwright fallback for verification had to be written from scratch because
  Claude-in-Chrome was not connected. Added the walk script to §7.
- The clip-path IntersectionObserver trap cost one full blank-page cycle (every below-fold
  reveal silently never fired). Added to §7 and to the SKILL.md field notes.

**Edits proposed and applied in this session.** `visual-script.md` §2b (deviation table),
§5 (measure the face); `implementation.md` §7; SKILL.md field notes.

**Open.** Formality dial guidance for *product* marketing pages (as opposed to
presentations) is thin — this use kept the REPORT pole's restraint and it read right, but
that is one data point.

## 2026-09-12 — job-hunt-hub landing, three takes juried (build mode, brand-constrained, multi-agent)

**Task.** The 2026-09-08 page read as a typeset document to its owner ("make a version that
*actually* carries the Awwwards feeling"). Three takes on the same world, one hypothesis each,
script → blind build → self-verify → two-lens jury (award feel; brand fidelity + craft) against
the current page, in one workflow (8 agents, ~2.7M tokens, 72 min). Then a graft round on the
winner and this retro.

**Perceived performance: 6/10 before, the method 9/10 as a lab.** The skill's *craft* rules
held on all three takes (type ladders, one entrance verb, restraint zones, colour budgets,
reduced-motion, phone) — and the craft rules are exactly what let the first use ship a page
with award feel 4. The gap was structural, not in the numbers: no rule required an object, a
stage, or anything the reader's hand moves, and the register guidance sent a brand build to the
least spectacular pole. Blind-building from three scripts and juring them surfaced ~45
concrete rules in one session; the two-lens jury disagreed on ranking only where feel and
fidelity genuinely trade (Survey Film vs Instrument), which is the disagreement you want.

**Friction.**
- "REPORT is the default" + "closest to the world" → the document. Fixed: SKILL.md §2 brand
  paragraph, Part IV B1.
- Nothing said a page needs an object or a scroll-linked mechanism; the §3 template had no
  line for either. Fixed: template Media/Object + Stage lines, gates §5b, B2–B3.
- The verification walk (1.1s, counts) could not see scrubbed motion, timed curtains, hover,
  the pre-hydration flash, or a blank boot; the builders' self-scores (7–8.5) were above the
  jury's on motion and interaction every time. Fixed: checklist 11–17, §8f tools, awardFeel +
  brandFidelity scores.
- Framework-page mechanics the references did not carry: boot state, scroll container ≠
  window, IO dead on sticky targets, row-triggered counters under React, hydration-relative
  clocks. Fixed: §8a–8e.
- The scripts padded rooms to reach 12–16 vh and the jury found every one; the arithmetic
  audit measured display strings only and mis-set ledes. Fixed: B5, B7, §5 hygiene.

**Edits applied.** `design-principles.md` Part IV; `visual-script.md` §2b, §3, §4, §5, §5b, §6;
`implementation.md` §6 (11–17), §8; SKILL.md §2, §3, §5, hard rules, field notes.

**Open.** One world, three takes: Part IV is validated-by-jury (1 world). A second brand
build on a different world would upgrade it. The graft round's result (winner + grafts,
re-juried) is the next data point; the Field Table's second pin is the one mechanism that
still has no validated parameters (dwell rule written from its failure, not from a pass).
