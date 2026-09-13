# The visual script — authoring guide

The visual script is the page's screenplay, written **before any code**: a section-by-section
spec of what appears, how it is composed, how it enters and behaves, with numbers. It is the
same artifact our extraction lab wrote when reverse-engineering award-winning pages — three
blind implementers reached 8.3–8.6/10 fidelity from such documents alone, so a well-written
script IS sufficient to produce the page. Ambiguity in the script becomes a bug in the build.

Save it as `visual-script.md` next to the deliverable. If the user is present, show them the
script's act list and register choice before implementing; if running autonomously, proceed.

## 1. Map the content onto the persuasion arc (S9)

Every validated page tells the same arc in "rooms". Map the presentation's content onto it —
this ordering is cross-validated on three sites and scored 9–9.5/10 for story every time:

| Act | Marketing page | Presentation equivalent |
|---|---|---|
| 1. Identity slam | Hero: oversized wordmark/claim | Title + one-line thesis, monumental |
| 2. Credibility (optional) | Partner logo wall | Who's involved / endorsements (A13) |
| 3. Belief / thesis | Manifesto statement | The core message, staged big |
| 4. System / chapters | Services, process | The content sections, numbered |
| 5. Proof | Work gallery, case studies | Data, evidence, results (A12 staging) |
| 6. Soul / climax | Poem, giant email, stat trio | The key takeaway — oversized, NOT a button |
| 7. Reassurance | Team, FAQ, details | Supporting details, methodology |
| 8. Ask | CTA rooms | Next steps / decision requested |
| 9. Footer reprise | Mega wordmark bookend | Title returns huge — the page rings |

Rules that carry the arc:
- **One recurring conversion action** threads the page (the same "ask" appears ~3 times).
- The climax is typographic/human, never a button.
- Total page length 12–19 viewport-heights (data-dense → shorter, ~12.5).
- Alternate "rooms": work rooms carry facts/lists; belief rooms carry statements (hard cuts
  between them on the BRUTALIST pole, one continuous ground on EDITORIAL, white frame +
  flat-color chapter rooms on REPORT — axis A7).

## 2. Choose the register (one pole per axis)

Load `design-principles.md` and pick a pole per axis (A1–A15). The three validated registers
are coherent ready-made bundles — start from one and deviate deliberately:

- **REPORT** (data-editorial) — the default for formal presentations: white ground + flat
  color rooms, one grotesk at weight 500, mono eyebrows, performed counters, native scroll,
  one house bezier, chip-strip or adaptive nav. Formal, credible, data-forward.
- **BRUTALIST** — dark, monumental, typographic; for statements of ambition, manifesto decks,
  agency-style confidence. Needs a true ultra-black (w800–900) face.
- **EDITORIAL** — light serif luxury; for brand, craft, culture, taste-led content. Needs a
  serif with a true italic.

Record every pole choice at the top of the script ("Register: REPORT; deviations: cursor from
BRUTALIST pole" etc.). Never blend poles unknowingly — an unnamed blend reads as noise.

### 2b. Brand-constrained builds: the deviation table

When the page belongs to an existing design world (tokens, faces, a colour budget, a house
easing, a motion rule), the brand wins every conflict (hard rule) — but only if the conflicts
are written down. Put this table under the register line, one row per axis the brand forces
off the pole, and never blend silently:

| Axis | Pole says | This page does | Why |
|---|---|---|---|
| A1 typeface | grotesk at 500 | Archivo 600 (the world's face) | one display weight, kept |
| A4 entrance verb | rise through a clip | wipe left→right through a clip | the world's motion metaphor; still never a fade (S2) |
| A14 colour | three flat hues | two marks with jurisdictions | the product's colour claim |

Everything not in the table is taken from the pole as specified. (First real use: an app's
marketing route; six rows, and the page kept its world while gaining the craft signals — and
read as a document, see below.)

Two more rules for the table, from the second real use (three juried takes,
`design-principles.md` Part IV):

- **Start from the brand's register, borrow one mechanism.** The world's faces, palette,
  corners and easing already are a register. Do not pick a pole bundle and bend the brand to
  it; pick the brand and borrow *one* mechanism from another pole per page — a pinned stage,
  a drawn object, a lag on objects only — and write that one row. A marketing page never
  defaults to REPORT (B1).
- **Inviolables are not axes, and imports have a budget.** The logotype's face, weight and
  tracking, the colour jurisdictions and the corner radius are never traded; list them above
  the table as inviolable. Every element imported from a pole the brand does not speak
  (custom cursor, marquee, glitch blink, loader gate, transparent bar, extra weights) is a row
  with a written reason or the world's equivalent; more than ~3 such rows and the page is no
  longer the brand (B10).

## 3. Per-section spec template

One block per section, in DOM order. Every claim numeric. Template:

```
### §N — <name> (Act: <arc act>)
Role: <one line — what this section does to the reader>
Ground: <bg color token> | Height: <~px or vh> | Layout: <columns/positions with px>
Type: <each text element: size(px or vw)/weight/case/tracking/line-height, measure width>
Content: <the actual copy, or gist + target length>
Media/Object: <slot size + aspect ratio + MOOD SPEC — for a brand build MATERIAL first (made
       of the world's own marks?), then value key (light/dark ground), then hue/texture; a
       generated object names its recipe and its reduced-motion frame; "none" if none — and
       the page as a whole may not say "none" everywhere (B2)>
Stage: <what the reader's hand moves here — pin length, sticky height, scrub window with its
       end (top 75–85% for prose/controls, 40% only for display), lerp, dwell before release,
       what is timed one-shot instead; "none — one-shot entrances only" if so (B3)>
Silence: <the empty area of this room, by position and size, as a composition element; a room
       is content + declared silence, never padding (B5)>
Arrival: <time from room entry to the exhibit's first complete state, ≤1.2s, and the counters'
       land time (B5)>
Counts: <exact number of items/rows/dots/cards — counts are composition (S6)>
Enter: <what animates in, mechanism + from→to + duration + ease + stagger; per element>
Still: <what does NOT animate — the negative is spec (S3)>
Hover: <each interactive element's feedback, mechanism + duration; "none" if none>
Ornament: <hairlines, indices, eyebrows — per the register's A9/A10 flavor>
```

## 4. The motion system — write it as ~6 generator rules

Before the per-section specs, compress the page's motion into a short rule set the
implementer can extrapolate from (this compression survived transfer intact in all three
validation cycles). Example shape:

1. Engine: <native scroll | Lenis lerp 0.05 + scrub 0.2–0.6 | IO variant machine> (axis A3).
2. One entrance verb: <e.g. "everything slides into clipped boxes, 0.5s house bezier
   cubic-bezier(0.44,0,0.37,1), 0.2s delay, 0.1s stagger; text always rises from masks,
   never fades" (S2, A4)>.
3. Easing voices: <the named set, 1–3 curves max, no bounce ever (S8, A5)>.
4. Hover grammar: <the single swap mechanism reused everywhere (S11)>.
5. Ambient life: <waveform spec: square/eased, min/max, period — or "still page" (A10)>.
6. Signature moment: <the loader/intro/identity choreography (S7, S13); on a framework page
   its clock is hydration-relative and the boot state shows the ground furniture (B6)>.
7. What the hand moves: <the scroll-linked mechanisms — pins with their dwell, scrubbed
   draws, docks, lags on objects — at least one; a page without one is a document (B3, B4)>.

## 5. Spec hygiene (each item below caused a scored gap when violated)

- **Numbers, not prose.** "Larger, offset" is not a spec; "120px, indented 300px" is.
- **State the negative.** Sections with no animation must say so, or the builder animates them.
- **Counts exact**, and rosters repeated across surfaces must reuse the same names/split.
- **Media mood: value key first** (light vs dark ground), then hue — a hue-only mood line let
  a builder invert the value and flip the emotional register.
- **Asset risks named.** The flagship font weight/italic is a risk: name a guaranteed stand-in
  (per A1's fallback stacks) or the whole style silently downgrades.
- **One scaling strategy declared**: vw-fluid display + px labels (default), or px at a
  canonical viewport. Desktop-first 1440×900 unless the user says otherwise.
- **Performed numbers fully specified**: size, target value, duration, affix-as-span, trigger,
  one-shot vs re-arm (A12).
- **Arithmetic audit before handoff**: child widths must fit their columns; anchors must not
  land text on a same-color panel; the type ladder must be internally consistent. **Measure
  the face** (render once, or `canvas.measureText`) before listing a bleed — an assumed
  0.55em/glyph claimed an overflow that a 0.47em grotesk never produced, and under-sized a
  condensed footer wordmark by a third.
- **Type-scale law**: keep the extreme ratio (S1) — monumental top, tiny annotation layer,
  and (outside the REPORT register) skip most of the 30–60px middle.
- **Overflow is rationed intent** (S5): list each deliberate bleed; everything else contained.
  A bleed across a hard cut must differ in value from the next room's ground (B4).
- **Measure ledes and body, not only display** (B7): ch × the measured em of the actual cut
  (Archivo 500 @22px ≈ 10.4px/glyph; Narrow 500 ≈ 0.43em); hand-break display lines only.
- **Gaps from the baseline** (B7): statement → body ≥ 0.5× the statement's font-size measured
  from the last baseline, not the line box.
- **Rooms are content + declared silence** (B5): heights are sums of content and named empty
  areas; reach the page length by adding rooms, never by a min-height.
- **Phone is not undefined**: say how the performed-numbers row wraps (as a column) even on a
  desktop-first script (B7).

## 5b. Gates before handoff (yes/no — a "no" means the script is not done)

1. Is there at least one **object** to look at, made of the world's material if the page has a
   world, with its reduced-motion frame specified? (B2)
2. Is there at least one mechanism the **reader's hand moves**, with its window, dwell and
   what stays one-shot? (B3, B4)
3. Does the **wordmark act** — born, docked, returned — and is the dock path checked against
   the furniture it crosses? (S13, B3)
3b. Does everything the **reader's hand draws** have its own layout cell, clear of the display
   type at every width — and does it wait for the dock to finish? (B3)
4. Does the **header react** per room, driven from measured room tops? (S12, B4)
5. Is the page **12–16 viewport-heights from rooms**, with no room padded past its content? (B5)
6. On a framework page, is the **boot state** specified — furniture visible, numbers hidden,
   clock from hydration? (B6)
7. Are the **inviolables** listed and the **imports** ≤ 3 with reasons? (B10)

## 6. Formality dial

The lab's registers came from marketing pages; presentations often need one notch more formal.
What to keep and what to relax:
- Keep: the arc, the type-scale ratio, mask-rise entrances, restraint zones, hairline systems,
  exact counts, the bookend. These ARE the premium feel.
- Relax: cursor theatrics (default cursor — the EDITORIAL/REPORT pole), glitch ambient loops,
  aggressive overflow, conversational CTA voice ("Got project?" → "Questions?" / "Discuss").
- Never relax into: smooth corporate type ladders (48/36/28…), bouncy easing, animate-
  everything, gray text on gray, generic decoration. Those are the anti-patterns the whole
  lab exists to avoid.
- For a **brand build** the "relax" list is the default, not optional: keeping a cursor, a
  glitch loop, a dark gate on a light brand or aggressive overflow needs a written reason in
  the deviation table (B10). And do not relax into stillness either — restraint zones are for
  list rows and hairlines, not for the whole page; a page with no stage, no object and no
  scroll-linked motion is a document, and the jury scores it as one (B1–B3).
