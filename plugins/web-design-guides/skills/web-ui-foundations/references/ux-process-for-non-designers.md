---
source: https://lovable.dev/guides/ux-process-design-for-non-designers
title: "UX Process Design: How Non-Designers Can Build User-Centered Products"
topic: lightweight UX research/design process for solo builders
value: 4
keep: yes
---
## Use when
Running a design process with no dedicated UX team/budget — deciding how much research, ideation, and testing rigor is actually needed before/while building.

## Rules
- Run the 5-phase design-thinking loop (Empathize, Define, Ideate, Prototype, Test — from Stanford d.school / IDEO, per guide) as an iterative, non-linear cycle, not a strict waterfall — expect to jump back to empathy after testing reveals something unexpected.
- Testing with 5 users surfaces roughly 85% of usability problems in an interface (Nielsen and Landauer's research, per guide) — small-sample testing is not a compromise, it's the empirically efficient sample size for early-stage work.
- Cheap empathy methods that need no research budget: 30-minute pain-point-focused customer interviews (not feature-request interviews), competitor review mining (G2/Capterra/app-store reviews for pattern extraction), and direct task observation. Document recurring patterns, not individual opinions — a signal is 3-of-5 people describing the same frustration, not one strong opinion.
- Frame the problem statement as: "[User type] needs a way to [action] because [insight from research]." This format forces the definition to stay traceable to an actual observed insight rather than an assumption.
- Keep personas to one page: name, role, primary goal, top 3 frustrations, one direct research quote. Ground every persona element in observed behavior, not demographic guesses (per Usability.gov guidance, cited in guide). Anything longer goes unused.
- Ideation should optimize for quantity before quality: timeboxed divergent generation (e.g., a 15-minute unfiltered list, or "Crazy Eights" — 8 rough concepts in 8 minutes) surfaces stronger concepts than filtering as you go. Filter afterward against 3 criteria: does it solve the Define-phase problem, is it buildable/testable within about a week, and does it match what users actually said (not what you assume they need).
- A prototype that takes longer than a few days to build is overbuilt for the prototype phase — match fidelity to the question being answered: paper sketches for layout/flow, clickable wireframes for interaction testing, working software only once you need to validate real behavior with real data.
- In usability testing, observe behavior over collected opinions — what users do (where they hesitate, misclick, or get stuck) is more reliable than what they say they'd do (per NNG usability testing methodology, cited in guide). Record specific moments ("4 of 5 couldn't find the save button"), not general impressions ("users seemed confused") — specific moments drive action, vague impressions don't.
- After testing, triage findings into 3 buckets before fixing anything: critical (blocks core task completion), important (task completes but with friction), nice-to-have (doesn't affect core function) — fix critical first, always.

## Anti-patterns
- Treating the 5 phases as a strict one-pass sequence instead of an iterative loop that can revisit empathy after testing.
- Producing long, unused persona documents or 40-page specs when the goal is to get from insight to a testable build quickly.
- Collecting only stated opinions ("users seemed confused") instead of specific observed behavior during testing sessions.
- Skipping straight to building without any user contact — the guide's repeated point is that even a few brief conversations save weeks of building the wrong thing.

## Checklist
- [ ] Talked to real users (5–8) before opening a design/build tool.
- [ ] Problem statement written in the "[user] needs [action] because [insight]" form, traceable to research.
- [ ] Prototype fidelity matches the specific question being tested (layout vs. interaction vs. real-data behavior).
- [ ] Testing sessions recorded specific behavioral moments, not general impressions.
- [ ] Findings triaged into critical / important / nice-to-have before starting fixes.
