# The validation lab — how knowledge earns its place in this skill

Every number in `design-principles.md`, `implementation.md` and `extraction-method.md` was
validated by this loop, not chosen by taste. Run it when you want the **strongest form of
merge** for a new reference site (a plain `extract` only adds `observed-once` items; a passed
blind clone upgrades them to `validated-by-clone`), or when a change to the knowledge base
needs a regression test. Everything here is self-contained — no external lab checkout is
assumed. Work in the extraction working directory the user named (default
`./design-extractions/<slug>/`).

## 1. The cycle (one reference site at a time)

1. **Extract** (browser, non-code). Observe the target site and write a design spec in plain
   language plus measured numbers — layout, typography, color, section narrative, and the
   full motion/interaction choreography. Follow `extraction-method.md` end to end. Measuring
   via computed styles is allowed; copying CSS/HTML is not. The spec must stand alone.
   Output: `<workdir>/extraction-structure.md` and `<workdir>/extraction-motion.md`.
2. **Clone from the spec only.** An implementer who has **never seen the original** (a fresh
   agent given only the extraction docs and `implementation.md`) builds a single-file HTML
   clone at `<workdir>/clone/index.html`. This is what validates the extraction: any fidelity
   loss is either missing spec (an *extraction gap*) or an unfaithful build (an
   *implementation gap*).
3. **Evaluate.** A browser agent A/B-compares original vs clone at the same fixed viewport
   the extraction recorded, scores the eight dimensions below, and classifies every gap as
   `extraction` or `implementation`. Output: `<workdir>/eval/round-N.md`.
4. **Refine — at most 3 rounds.** Extraction gaps → targeted re-extraction (append a
   round-correction appendix to the extraction docs, do not rewrite them); implementation
   gaps → clone fix. Stop at the **pass bar** or after round 3, whichever comes first. A site
   that has not passed after 3 rounds is recorded as such and its findings stay
   `observed-once`.
5. **Distill.** Write the site-agnostic findings into the knowledge base (`design-principles.md`,
   and `extraction-method.md` for method lessons), following the merge rules in section 4.

Serve the clone locally for the evaluator with
`python3 -m http.server 8140 --directory <workdir>` → `http://localhost:8140/clone/index.html`.

## 2. Pass bar and eval dimensions

**Pass = overall ≥ 8/10 AND no dimension < 6.** The eight dimensions, scored 0–10 each
(same set `build` self-scores against, where the bar for your own work is nothing below 8):

1. Hero first impression
2. Layout
3. Typography
4. Color / mood
5. Story structure
6. Motion
7. Interaction feedback
8. Craft (details, consistency, finish)

Every gap in the eval carries: the dimension it hits, its class (`extraction` /
`implementation`), whether it is blocking, and the number or mechanism that would have
prevented it.

## 3. Knowledge-first transfer test (the second site onward)

Before extracting a new site, first try to clone it **using only the accumulated
knowledge** (the current references, no fresh extraction). If that clone passes, the
knowledge transferred and the site only confirms it. If it fails, extract from the new site,
merge, and regression-test the merge (section 4). Two consecutive knowledge-first passes on
distinct registers is the convergence signal — that is how this skill's loop was declared
converged.

## 4. Merge and regression rules

- **Versioned knowledge files are baselines, never edited.** Each cycle produced
  `vN-<site>-principles.md` and `extraction-method-vN.md`; a new version *carries every earlier
  item forward* and marks additions with the cycle tag (`[v2]`, `[v3]`). The bundled
  `design-principles.md` and `extraction-method.md` are the v3 files. Earlier versions are
  not shipped here, but the rule survives: when merging, **never average away, weaken, or
  delete a validated number or item** — they are the regression tests for every earlier clone.
- New evidence for an existing principle upgrades its confidence tag (`observed-once` →
  `validated-by-clone (1 site)` → `cross-validated (2 sites)` → `cross-validated (3 sites)`).
- A divergence from a validated principle becomes a **new axis pole or a new axis**, expressed
  with the site's parameters, never a blended midpoint.
- Every addition names its source site and starts at `observed-once` until a blind clone
  validates it.
- After a merge, the regression test is: the earlier clones must still be reproducible from
  the merged knowledge. If a merged edit would have broken an earlier clone's passing score,
  it is wrong, however good it looks for the new site.

## 5. Content policy for clones

Clones are local study artifacts, never published. They paraphrase all copy (similar length
and casing), use an invented brand name, and replace images/videos/logos with placeholder
gradient/pattern boxes (see `implementation.md` section 5). We replicate *technique* —
structure, type, motion — not brand assets.

## 6. Working directory layout

```
<workdir>/                       # default ./design-extractions/<slug>/
  extraction-structure.md        # static design spec (+ round-correction appendices)
  extraction-motion.md           # motion/interaction spec (+ round-correction appendices)
  clone/index.html               # blind clone, single file
  eval/round-N.md                # one per evaluation round, max 3
  shots/                         # reference screenshots when saved
```

## 7. Provenance

Three cycles built the shipped knowledge, all passing in round 1:

| Site | Register | Score | Gaps (extraction / implementation) |
|---|---|---|---|
| HOBRO (hobro.digital) | dark mono-brutalist agency | 8.3/10, none < 7.5 | 3 / 9 |
| Vero (verostudio.com) | luxury-editorial serif atelier, knowledge-first | 8.6/10, none < 7.5 | 2 / 6 |
| State of AI Design (stateofaidesign.com) | data-editorial report page, knowledge-first | 8.6/10, none < 7 | 3 / 5 |

Site triage before HOBRO rejected aardvarkbookclub.com (preloader hangs under automation),
seasats.com (video-dominated, blank headless), goodgrowth.com (gated), sharplink.com (froze the
tab renderer), brand.squarespace.com (video-asset-heavy) and decathlonyestalgia.com (very slow
load) — `extraction-method.md` section 0 carries the triage checklist those taught. Scope of
all three cycles was desktop 1440×900.
