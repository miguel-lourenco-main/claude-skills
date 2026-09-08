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
                           "$HOME/Desktop/personal/projects/claude-skills" \
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

### 3 · Write the visual script

Load `$REF/visual-script.md` and follow it: map the content onto the persuasion arc, write
the motion system as ~6 generator rules, then per-section specs with numbers. Save as
`visual-script.md` next to the deliverable. If the user is present, show the act list and
register for a quick confirm before building; running autonomously, proceed. A page built
without a script drifts generic — this step is never skipped.

### 4 · Implement

Load `$REF/implementation.md`. Build one self-contained HTML file from the script: engine
per the chosen A3 pole, fonts with asset-risk fallbacks, the real content from step 1.
Placeholder media only where the user has no assets, mood-matched per the script.

Scope default is desktop 1440×900 first. Add responsive behavior only when the user asks or
the venue demands it, and state which you did.

### 5 · Verify in bounded passes

Open the page in the browser. Do one full slow-scroll pass plus hover and interaction
checks, then self-score against the 8 dimensions (hero first impression, layout, typography,
color/mood, story structure, motion, interaction feedback, craft) using the checklist in
`implementation.md` section 6. Bar for your own work: nothing below 8. Fix everything found
in **one batch**, confirm with **at most one more pass**, and stop — report anything still
below the bar rather than polishing further. Open-ended polish loops are banned.

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
  tension in the script rather than silently blending.
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
