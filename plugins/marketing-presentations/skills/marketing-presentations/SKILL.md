---
name: marketing-presentations
description: Build an HTML presentation, deck, report page, or story page that feels like a high-end marketing/landing page — scroll-driven visual storytelling with award-site craft (oversized typography, choreographed motion, section-by-section narrative), written first as a "visual script" and then implemented as a single-file HTML page. Use when the user says "make this presentation feel like a landing page", "turn this deck into a scroll page", "a marketing-style report page", "an Awwwards-looking presentation", "visual story page for this content", "build me a launch/keynote page from this outline", or "extract the design from <url>" to grow this skill's knowledge base from a reference site. NOT for app UI, dashboards, or product screens (use impeccable / ui-ux-director), NOT for plain readable documents (use plain-report), and NOT for scroll-scrubbed 3D world pages (use scroll-world).
argument-hint: "[build|extract <url>] [content source / target]"
---

# Marketing presentations

This skill builds **HTML presentations that feel like marketing pages**: one scrollable page
that tells the content's story visually, with the craft signals of award-winning sites, one
notch more formal. Its knowledge base is empirical, not taste: award-winning pages were
observed, specced in prose + numbers, then blind-rebuilt by an implementer who never saw the
original, and knowledge was kept only when the rebuild scored ≥ 8/10 against the original
(three sites, 8.3–8.6/10 — see `references/validation-lab.md`). **Trust the numbers in the
references.**

Two modes. `build` (default) turns content into a page. `extract <url>` grows the knowledge
base from a reference site. Both are mutating; what each writes and where is stated below.

## 0 · Resolve paths

```bash
MP="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/marketing-presentations}"
[ -d "$MP" ] || MP="$HOME/.claude/skills/marketing-presentations"
REF="$MP/references"; [ -d "$REF" ] || REF="$MP/reference"   # pre-plugin personal copy
ls "$REF"/{design-principles,visual-script,implementation,extraction-method,validation-lab}.md \
  || echo "knowledge base incomplete — tell the user; build without design-principles.md is not allowed"
# extract mode merges into the user's skills CHECKOUT, never the plugin cache:
REPO="${SKILLS_REPO:-}"
[ -n "$REPO" ] || for d in "$HOME/Workspace/personal/projects/claude-skills" \
                           "$HOME/Desktop/workspace/personal/projects/claude-skills" \
                           "$HOME/projects/claude-skills" "$HOME/claude-skills"; do
  [ -d "$d/.claude-plugin" ] && REPO="$d" && break
done
KB="${REPO:+$REPO/plugins/marketing-presentations/skills/marketing-presentations/references}"
[ -d "$KB" ] || echo "no checkout found — extract will write its report only; ask the user where to merge"
```

Knowledge base (`$REF`):
- `design-principles.md` — 14 cross-validated principles (the spine) + 15 style axes with
  three named register poles: BRUTALIST, EDITORIAL, REPORT.
- `visual-script.md` — how to write the page's screenplay before coding.
- `implementation.md` — validated build patterns per engine pole, with code, and the
  verification checklist.
- `extraction-method.md` — how to extract design knowledge from a reference site.
- `validation-lab.md` — the extract → blind-clone → evaluate loop, pass bar, and merge rules.

## Mode A — build (default)

Writes two files next to each other in the directory the user names (default: the current
directory): `visual-script.md` and the deliverable `<name>.html`, a single self-contained page.

### 1 · Understand the content

Read the presentation source the user names (outline, doc, data, existing deck). Establish:
audience, the one decision or message the page argues for, formality level, brand
constraints (colors, fonts, logo), and where it will be shown. Ask only what cannot be
inferred, in one batched question round.

### 2 · Choose the register

Load `$REF/design-principles.md`. Pick one pole per style axis, starting from a coherent
bundle — REPORT is the default for formal or data presentations; BRUTALIST for manifesto or
ambition; EDITORIAL for brand, craft, taste. Record the choices and every deviation
explicitly; they go at the top of the visual script.

**If the page belongs to an existing design world** (an app's tokens, faces, colour budget,
easing) the world *is* the register: start from it and borrow **one** mechanism from another
pole — a pinned stage, a drawn object, a lag on objects — recorded in the deviation table.
Do not default a *marketing page* to REPORT; it produced a well-set document with no award
feel (Part IV, B1). Within a one-face, one-weight brand the EDITORIAL engine carried the most
feel; REPORT caps interaction; BRUTALIST costs fidelity. List the inviolables (logotype,
colour jurisdictions, corners) above the table and keep imports from foreign poles ≤ 3.

### 3 · Write the visual script

Load `$REF/visual-script.md` and follow it: map the content onto the persuasion arc, write
the motion system as ~6 generator rules, then per-section specs with numbers. Save as
`visual-script.md` next to the deliverable. If the user is present, show the act list and
register for a quick confirm before building; running autonomously, proceed. A page built
without a script drifts generic — this step is never skipped. Before handing the script to
the build, run its **gates** (`visual-script.md` §5b): an object to look at, a mechanism the
reader's hand moves, a wordmark that acts, a header that reacts, 12–16 viewport-heights from
rooms (never padding), a boot state on framework pages. A "no" means the script is not done.

### 4 · Implement

Load `$REF/implementation.md`. Build one self-contained HTML file from the script: engine
per the chosen A3 pole, fonts with asset-risk fallbacks, the real content from step 1.
Placeholder media only where the user has no assets, mood-matched per the script.

Scope default is desktop 1440×900 first. Add responsive behavior only when the user asks or
the venue demands it, and state which you did.

### 5 · Verify in bounded passes

Open the page in the browser (or the Playwright tools in `implementation.md` §8f when the
extension is down). Do the **two-pass walk** (1.1s and 2.5s settle, every frame read), the
**timed hero capture** (0/200/500/900/1400/2400ms — no finished-state flash, furniture visible
at t200), **flipbooks** over every pin and scrub, a **hover capture**, the header across every
room boundary, and the phone and reduced-motion frames — the checklist in `implementation.md`
section 6, items 1–17. Then self-score the 8 dimensions (hero first impression, layout,
typography, color/mood, story structure, motion, interaction feedback, craft) **plus
awardFeel and brandFidelity** — a page can score 8 on every craft dimension and 4 on
awardFeel; that is the document failure mode. Bar for your own work: nothing below 8. Fix
everything found in **one batch**, confirm with **at most one more pass**, and stop — report
anything still below the bar rather than polishing further. Open-ended polish loops are
banned.

## Mode B — extract <url>

Grows the knowledge base from a reference site the user names (e.g. an Awwwards pick).
Writes the extraction spec to a working directory and, with the user's approval, merges
findings into `$KB/design-principles.md` in the checkout.

### 1 · Triage and extract

Load `$REF/extraction-method.md` and follow it end to end. Triage first (section 0) — some
sites do not survive automation, and the method says how to tell and what to do instead.
Ask the user for the working directory; default `./design-extractions/<slug>/`, laid out as
in `validation-lab.md` section 6 (`extraction-structure.md`, `extraction-motion.md`).

### 2 · Merge into the knowledge base

Propose the merge as a diff against `$KB/design-principles.md` (and
`extraction-method.md` for method lessons) and apply it once the user approves:
- new evidence for an existing principle upgrades its confidence tag;
- divergences become new axis poles or new axes — **never average away or weaken a
  validated item**; they are regression baselines (`validation-lab.md` section 4);
- mark every addition with the source site and `observed-once` until a blind rebuild
  validates it.
No checkout found → write the report and hand the user the proposed diff instead.

### 3 · Report, and offer the full loop

Report what was added and what the site confirmed. For the strongest form of merge — blind
clone + A/B evaluation, at most 3 refine rounds, pass bar ≥ 8/10 with no dimension < 6 — offer
to run the loop in `$REF/validation-lab.md`; do not start it unasked.

## Hard rules

- The visual script comes before code, always.
- No bounce easing, no animate-everything, no smooth corporate type ladders (48/36/28…), no
  gray-on-gray — the anti-patterns the knowledge base exists to prevent.
- Restraint zones (sections specced as "still") stay still.
- When brand constraints conflict with a register's numbers, the brand wins; note the
  tension in the script rather than silently blending. The logotype's face, weight and
  tracking are never an axis.
- Every page names at least one object to look at and one mechanism the reader's hand
  moves; a page of one-shot entrances is a document, however well set (Part IV, B2–B3).
- Commit controls and prose are never scrub-bound; scrub windows for text end by top 75–85%.
- Rooms are content + declared silence: reach the page length by adding rooms, never by
  padding one; an exhibit's first complete state lands ≤ 1.2s after its room enters.
- On a hydrated framework page the hero has a boot state set from the HTML (`<html
  data-boot>`), never blank for > 300ms, with performed numbers hidden until they perform.
- State words (Yes, live, Free, Not set) never take the measuring colour.
- Extracted clones are local study artifacts: paraphrased copy, invented brand, placeholder
  media, never published (`validation-lab.md` section 5).

## Field notes

Appended after real uses — see FEEDBACK.md.

- **2026-09-08 — first real use, an existing Next.js marketing route with its own design
  world.** The method held; the deliverable was the page's components rather than a
  single file. What it added to the references: the brand-deviation table
  (`visual-script.md` §2b), a section on applying the skill to an existing framework page
  plus a Playwright verification walk for when the browser extension is down
  (`implementation.md` §7), and two silent mechanics — a clip-path'd target has zero
  intersection area (observe with `threshold: 0`), and oversized hollow type has phantom
  scrollable height (`overflow-y: clip`). Page went from ~8 to ~10 viewport-heights;
  e2e and reduced-motion checks stayed green.
- **2026-09-12 — second real use: the same route, three takes juried for award-site feel.**
  The first use had shipped a document — craft 8s, award feel 4. Three takes on the same
  world, one borrowed mechanism each (pinned stage + drawn object / layered lag + overflow /
  materiality + curtain stack), built blind from scripts and juried on two lenses. The
  pinned-stage take won both (8 / 8); the lag take had the strongest viewports and lost the
  brand (5); the materiality take had the best in-world objects and no interaction (6.5).
  What it added: `design-principles.md` Part IV (B1–B11: brand register rule, the object
  layer, scrub windows, dwell, rooms as content + silence, the boot state, type gaps from the
  baseline, colour negatives, perceptibility, import budget, motion-aware verification),
  `visual-script.md` §5b gates and the Stage / Silence / Arrival template lines,
  `implementation.md` §8 (boot script, hero pin, curtain stack under a sticky collar,
  generated contour object, mask geometry, the five Playwright tools) and checklist items
  11–17. The three takes and their scripts stay in the app's `/v` gallery as the record.
