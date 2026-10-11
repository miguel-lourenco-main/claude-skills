# Prior art — what we took, what we refused

**Jane-xiaoer/claude-skill-web-clone (MIT).** Took: browser recon probes and route crawl.
Refused: "real source first". We never clone source, source maps or assets; mechanisms are named, not copied.

**JCodesMore/ai-website-cloner-template (MIT).** Took: the map, observe, build, compare phases and
"exercise alternate states". Refused: the fixed Next.js output and building inside the skill. We stop at the spec; genesis builds.

**ragnar-pwninskjold tech-snacks ui-cloner (MIT).** Took: the forensic-audit, synthesis, quality-check split.
Refused: the brand-interview step; not our job.

**1GMedia/attract-reverse-engineer (MIT).** Took: the five-label evidence ladder (verified static /
verified runtime / strongly inferred / tentative / unknown, which maps to our M/O/D/I/U), the clean-room
blueprint's "behavioural scope and non-goals" and "unknowns, risks and proof steps" sections, and
"rebuild-effort honesty". Refused: the 21-section report, too heavy for a spec a rebuilder reads.

**boshu2/agentops reverse-engineer.** Took: the docs/code/hosted separation ("documented ≠ enabled ≠
observed") and evidence-tagged rows. Refused: the steal-map verdicts; we replicate, not adopt.

**morluto/rea (MIT).** Took: "unknowns are reported as unknowns, never as absence" and passive
observation (record cookie/header names, never values). Refused: binary tooling.

**In-house.**
- marketing-presentations `extraction-method.md`: visual/motion method, delegated by reference.
- ui-adversary briefing pattern: one background agent, evidence-or-nothing.
- prospect-blueprint: capture, study, plan; evidence-traceable register.

## Open-source Noisli-likes (when the target is an ambient mixer)

- **remvze/moodist** (MIT; Astro + React + zustand + Howler). 89 sounds, Pixabay-licence/CC0. Share
  link `?share=<JSON {id:volume}>`. Oscillation: cosine, 10 s period, floor 0.4, 50 ms tick, 250 ms fades.
- **mateusfg7/Noisekun** (MIT; Next.js + zustand, plain `<audio>`). 23 mostly-CC0 sounds; combos in
  URL `sounds=id,vol;…`.
- **brunobord/relax** (WTFPL, 2021).

Use them for licensed assets and as reference implementations to cite, never to copy into a spec as
if observed on the target.
