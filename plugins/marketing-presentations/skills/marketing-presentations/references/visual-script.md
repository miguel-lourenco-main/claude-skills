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
marketing route; six rows, and the page kept its world while gaining the craft signals.)

## 3. Per-section spec template

One block per section, in DOM order. Every claim numeric. Template:

```
### §N — <name> (Act: <arc act>)
Role: <one line — what this section does to the reader>
Ground: <bg color token> | Height: <~px or vh> | Layout: <columns/positions with px>
Type: <each text element: size(px or vw)/weight/case/tracking/line-height, measure width>
Content: <the actual copy, or gist + target length>
Media: <slot size + aspect ratio + MOOD SPEC — value key FIRST (light/dark ground), then
       hue/texture; "none" if none>
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
6. Signature moment: <the loader/intro/identity choreography (S7, S13)>.

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
