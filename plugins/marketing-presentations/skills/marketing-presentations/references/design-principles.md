# Design principles v3 — site-agnostic, three styles validated

Evidence base: three full extract→blind-clone→evaluate cycles, each passing round 1.
- **Site 1 "HOBRO"** (hobro.digital) — dark mono-brutalist / Swiss-poster monochrome editorial
  agency page. Clone 8.3/10, no dimension < 7.5.
- **Site 2 "Vero"** (verostudio.com) — luxury-editorial serif atelier page, stylistically the
  opposite register. Clone 8.6/10, no dimension < 7.5. Knowledge-first clone (v1 knowledge);
  transfer test passed.
- **Site 3 "AIID"** (stateofaidesign.com) — **data-editorial** report-as-marketing-page
  (Framer-built survey report: flat color, grotesk-loud, counters, chapter slides). Clone
  8.6/10, no dimension < 7. Knowledge-first clone (v2 knowledge); second consecutive transfer
  pass, on a third distinct register.

Confidence tags:
- **cross-validated (3 sites)** — all three registers exhibit the principle, all three clones
  rebuilt it blind, all three evaluators confirmed it carried the feel. As close to law as
  this lab gets.
- **cross-validated (2 sites)** — two sites exhibit it; the third neither confirms nor
  refutes (or diverges along a named axis).
- **validated-by-clone (1 site)** — proven through one full clone loop; tagged with its pole.
- **observed-once** — measured but not (fully) stress-tested through a clone.

Where the sites diverge, the divergence is expressed as a named **STYLE AXIS** with each
pole's parameters. Do NOT average across an axis — the poles are coherent registers, and a
future presentation skill must be able to hit any of them. Every validated v1/v2 number is
preserved.

The three poles are named throughout: **BRUTALIST** (site 1), **EDITORIAL** (site 2), and
**REPORT** (site 3, the data-editorial register).

---

## Part I — Cross-validated principles (the shared spine)

These held on a black/white grotesque site, a beige/serif site, and a white/flat-color data
report. They are the invariant core of "marketing-page feel".

### S1. Extreme type-scale ratio is the single biggest premium signal — cross-validated (2 sites), with a REPORT variant
- BRUTALIST: ~15:1 — 12.5vw display (≈213px @1707) down to 14px mono labels; one middle voice
  4.17vw (≈71px), one subtitle 1.46vw (≈25px), body 16–18px.
- EDITORIAL: ~17:1 — 168px (9.84vw) poem / 120px (7.03vw) statements down to 10px carousel
  subtitle; labels 15–21px, body 16–18px, editorial statements 30px.
- The premium feel comes from the *gap*, not the sizes: both sites skip most of the 30–60px
  range so every text element is either monumental or an annotation. A conventional smooth
  scale (h1 48 / h2 36 / h3 28…) reads corporate.
- **REPORT variant (honest divergence, do not average)**: the data register runs a *denser*
  ladder (120/85/80/50/40/32/24/20/16/13) — it needs the middle rungs (50px statements, 40px
  slide headlines, 32px section titles) because it narrates data section by section. It keeps
  the premium signal a different way: **the top of the scale stays monumental (120px at −6%)
  and the annotation layer stays tiny (13px mono)** — ~9:1 ends-of-ladder — and hierarchy
  never comes from weight or color (one weight, 500, does 95% of the page). Ratio-with-a-gap
  is the BRUTALIST/EDITORIAL law; monumental-ends-plus-one-weight is the REPORT law.
- Express display sizes in **vw** so composition survives viewport changes; keep labels in px.

### S2. Text rises out of masks; it is never faded in — cross-validated (3 sites)
- Every headline/paragraph splits into chars/words/lines inside `overflow:hidden` wrappers and
  enters `y/translateY 100%→0`. All three sites; all three clones; all three evaluators
  confirmed it carries the voice. REPORT: chapter index + name start +112px below a 76px clip
  and rise on slide entry, ~0.1s stagger; the whole intro nav slides x −610→0 into its clip.
  (The one sanctioned exception: EDITORIAL lets *italic* words fade, .6s out-sine — a
  deliberate softness contrast against the rising caps.)
- Reveal grammar should be **universal per site**: one in-spec, one out-spec, applied everywhere
  (see axis A4 for each pole's parameters). Consistency of the grammar is itself the signal.
  REPORT compresses this to its purest form: **one entrance verb** — everything arrives by
  sliding along one axis into a clipped box (0.5s, one bezier, 0.2s delay, ~0.1s stagger);
  nothing fades alone.

### S3. Restraint is part of the system — cross-validated (3 sites)
- Both cycle-1/2 proof galleries (13 staggered tiles / 4×5 contact-sheet grid) have **no
  entrance animation and no tile hover at all**; REPORT leaves its partners wall, inflection
  statement, about column, carousel entrances and footer link blocks completely still — and
  all three evaluators praised the clones for correctly NOT animating them. List rows and
  hairlines don't animate. Motion is spent on headlines, belief moments, staged numbers and
  interactive furniture. A clone that animates everything is *less* faithful.
- Corollary: the spec must state where there is NO animation — the negative is spec.

### S4. Color discipline: a tiny, rationed palette with strict allowed-use rules — cross-validated (3 sites); *where color lives* is an axis (A14)
- BRUTALIST: pure `#000`/`#FFF`, no grays in type, one media-loading gray `#DDD`, one neon
  accent `#00FB96` used solely at ~6px-dot scale (cursor dot, **social-icon hover fill flash**,
  0.3s — see S11) — never for text or larger fills. Color 9/10.
- EDITORIAL: one ink `#181615` on one ground `#f3f0ed` (+ beige-300 `#e6d8cc`, grey-100
  `#f8f8f8` surfaces, grey-600 muted); the only chrome color is a 3–4%-opacity orange/red glow.
  Color 9.5/10.
- REPORT: white ground, black type/hairlines, and exactly three brand fills — orange `#fe7141`,
  lavender `#cdabfe`, sage `#d1ddd3` — each with a written allowed-use list, deployed as
  **whole flat surfaces** (a full-viewport slide, a nav chip, a dropdown panel, a 16px accent
  bar), always carrying black type. **One accent per surface**; muted states are 60%-alpha
  ink, never new hues. Color 8/10 (the deduction was a media-value miss, not palette).
- Invariant across all three: the palette is tiny, every color has a written jurisdiction, and
  richness beyond the palette lives **inside the media** (warm amber film / solarized-botanical
  grain). What diverges is *where* the designer's own color is allowed to live — subliminal
  accent vs flat rooms — which is now axis **A14**.
- COLOR NEVER ANIMATES except via opacity; theme swaps crossfade ≤.3s.

### S5. Deliberate overflow, strictly rationed — cross-validated (3 sites)
- BRUTALIST: headlines start offscreen (x ≈ −85px) and/or run past the right edge; the hero
  wordmark crops mid-letter. "The frame is too small for the brand, on purpose."
- EDITORIAL: stepper media bleeds exactly 190px past the right edge (1897px wide); exactly ONE
  poem line bleeds to x1811; everything else strictly contained (~3 bleed moments total).
- REPORT: the preface photo enters oversized (2497×1360 at x−400, bleeding right and bottom)
  and eases toward rest; carousel cards run ~2.2 viewports past the right frame edge (the
  overflow *is* the paging affordance). Everything else sits inside the 16px frame.
- Invariant: overflow is a *chosen per-element (per-line) intent*, never an accident, and it is
  rationed. Two cycles produced a climax-composure bug when this was fumbled (contained title
  overflowing / poem clipping). Overflow the identity slams; contain the manifesto.

### S6. Counts are composition — cross-validated (3 sites)
- 20 services, 13 tiles, 24 names, 63 dots, 8 stickers / 3 steps, 4×5 grid + 20 repeated
  wordmark labels, 8-line poem, 6 menu links / 7 partners, 3 chapters, exactly 5 list rows per
  chapter, 7 case studies split 3-live/4-coming-soon. Reproduce counts exactly — all three
  evaluators checked them, and cycle 1's dot count (28 vs 63) was a scored gap. **[v3]** When
  a roster repeats across surfaces (nav dropdown, carousel, footer), the *same* invented names
  in the *same* split must appear on every surface — roster consistency was explicitly
  credited in the cycle-3 eval.

### S7. Loaders/intros are choreographed signature moments — cross-validated (3 sites); progress-binding is 2-site
- Both cycle-1/2 loaders track **real asset progress** (hold states, eased jumps), then convert
  the loading UI itself into the hero reveal: BRUTALIST bar → letterbox window → full-bleed
  film; EDITORIAL type-hole (15.6vw mini-viewport window mid-headline) → full-screen → the
  hero. A fixed-duration fake loses the uncertainty-then-release drama (scored against the
  cycle-1 clone). Cached revisits compress the same script (~1.5–2s), not a different one.
- REPORT validates the *signature-moment* half with a scroll-locked 3-phase **identity intro**
  (~3.5–4.5s: full-viewport film + floating lockup → black band wipes across carrying the
  wordmark at huge scale → lockup shrinks and docks into the nav chip while the hero settles
  and scroll unlocks) — but it is time-choreographed, not progress-bound. So: the intro as
  drama is cross-validated (3 sites); **progress-binding stays cross-validated (2 sites)** and
  should be honored wherever a loader shows progress UI.
- BRUTALIST timing (validated-by-clone): the letterbox opens to full-bleed in **~1–1.2s, brand
  ease**, while the wordmark stamps in letter-by-letter at **~0.15–0.25s stagger, rising from
  bottom masks** (tighter than the generic ~1–1.4s reveal band in S8 — use these numbers for a
  strict re-implementation of this pole).

### S8. Nothing bounces — cross-validated (2 sites), consistent with the 3rd
- Zero spring/bounce/overshoot anywhere on either of sites 1–2. Each site runs a small set of
  named easing voices with a long-slow-in / quicker-out asymmetry (parameters per pole in A5).
  Duration bands are shared: 0.2–0.6s for anything the cursor touches, ~1–1.4s for cinematic
  reveals/wipes, multi-second only when paced by scroll (BRUTALIST measured: **2–3s
  scrub-timeline lengths**, paced by scroll).
- REPORT is consistent — one decelerating house bezier `(0.44,0,0.37,1)` everywhere, no
  overshoot observed — but its Framer springs (nav dock, spring-follow photo) were never
  watched live in either occluded session, so the third validation is *probable, unconfirmed*.
  Honest tag stays at 2 sites until a visible-tab pass.

### S9. Story structure: a persuasion arc in rooms/acts, bookended — cross-validated (3 sites)
- All three pages tell an act-by-act arc and scored 9–9.5 on story: identity slam →
  belief/thesis → system/process (or chapters) → proof (gallery / case-study carousel) →
  soul/emotional climax → reassurance → explicit ask → footer reprise of the identity.
  Page lengths: ~17–19 viewport-heights (BRUTALIST, EDITORIAL); **~12.5** (REPORT, 11310px @
  907 — the data register is denser but the arc is identical, 11 acts). Range now 12–19.
- **One recurring conversion action threads the whole page** (deck-request pill / "Start your
  COMMISSION" ×3 / "Read the Chapter" row-CTA ×3 + subscribe anchors ×3) plus secondary CTAs,
  plus one *emotional* climax that is not a button.
- **Bookend**: the wordmark treatment recurs at the end (mega footer wordmark / footer 3D
  scene band with the wordmark / 1665px-wide footer wordmark SVG + 699px year numeral) — the
  page rings like a chorus.
- The proof section shows placement/results, not claims (case tiles / sculptures in clients'
  homes / seven named companies with video stills).
- **[v3] REPORT adds a credibility act near the top**: a partners logo wall directly under the
  hero (see A13) — proof borrowed *before* the argument, distinct from the proof gallery that
  comes after it.

### S10. Hairline systems and quantified ornament — cross-validated (3 sites)
- 1px rules everywhere (list rows incl. intentionally empty trailing rows, underline draws,
  newsletter field bottoms, full-container slide-top rules); 1.5px only for the loader
  progress bar (EDITORIAL); nothing heavier than 1px except color blocks (REPORT). Numbers
  woven in as ornament: "(01)–(04)" indices, "[1]…[24]" chips, italic counters / step dots,
  "I.–VI." numerals (mobile menu), 18px superscript "01…07" beside every big noun. Ornament
  flavor differs per pole (A9) but the hairline+number substrate is shared.

### S11. Hover feedback = content swap through the mask grammar — cross-validated (3 sites)
- The signature hover on all three sites reuses the entrance grammar: BRUTALIST mask-flip
  (index flips out up `yPercent −100` 0.2s, hidden word flips in from below); EDITORIAL
  roll-swap (duplicated label, top copy `translateY(−100%)`, clone rises, ~.4–.6s expo
  family); REPORT **wipe + roll-swap** (every interactive surface pre-renders its filled twin
  at −100% x and slides it in — one mechanism, five colorways — while nav labels carry a
  duplicated twin 18px below for the roll-up). Plus underline draws: `scaleX/bg-size 0→100%`
  left→right (BRUTALIST 0.25–0.35s; EDITORIAL .6s cubic-bezier(.55,0,.1,1) +.1s delay, exit
  slides out right).
- **BRUTALIST cinematic hover** on hero-scale media (validated-by-clone, interaction 8.5/10):
  a duplicate "cover" layer wipes in via clip-path over **1s brand ease**
  `cubic-bezier(0.785,0.135,0.15,0.86)` — deliberately slow, the opposite voice from the 0.2s
  flips. (Measured: "Latest case", clip-path, 1s — `sites/hobro/extraction-motion.md` §4.)
- **BRUTALIST small hover grammar** (validated-by-clone): icon fills flash the accent green
  `#00FB96` (0.3s); pill text dims to mid-gray (0.3s); split elements part **±30px** (0.4s).
- **No press/click animations on any site** — feedback lives entirely in hover; no
  scale/shadow dress on buttons anywhere (REPORT's bare 32×32 arrows stay bare).
- Everything interactive shares one registered mechanism (one cursor-trigger class / one
  duplicated-label pattern / one parked-twin wipe) — consistency of feedback is itself a craft
  signal.

### S12. The fixed header adapts to the ground it crosses — cross-validated (2 sites); REPORT forks the paradigm (A15)
- Slim fixed header (65px / 75px) with no background of its own; it survives section changes
  by theme swap: BRUTALIST inverts over dark sections (class toggle, `filter:invert(1)` on
  logo, 0.3s); EDITORIAL crossfades `theme-transparent` (grey-100 text, 20%-opacity pill) →
  `theme-plain` (grey-900, solid pill) at hero exit. Never a solid header bar — *on these two
  poles*.
- **[v3]** REPORT deliberately breaks the "never solid" half with the **chip-strip nav** (56px
  of flush solid color blocks) — but keeps the *adaptive* half: the fixed bar hides
  (translateY −60) over the hero and docks down only when the hero scrolls away, with a twin
  intro-nav inside the hero handing off. The invariant across all three is now: **the header
  is never a static passive bar — it reacts to what it crosses** (theme swap or dock/hand-off).
  The solid-vs-transparent choice moves to axis A15.

### S13. The wordmark is an actor — cross-validated (3 sites)
- It participates in motion rather than sitting in the corner: BRUTALIST stamps in
  letter-by-letter through the loader and returns as the mega footer title; EDITORIAL is born
  centered over film at 250×75 and scrubs scale 1→0.352, translateY 396→14 to dock into the
  header (809,39 @88×26), returning in the footer scene; REPORT's lockup assembles from letter
  pieces mid-hero, rides a black band wipe at huge scale, docks into the 160px black nav chip
  (142×36 at 9,10), and returns as a **1665px-wide footer SVG** beside a 699px year numeral —
  identity as the final exhibit.

### S14. Media slots carry a mood spec — value key first — cross-validated (3 sites)
- Every media slot is described by mood, and stand-in gradients matched to that mood preserved
  the color dimension at 8–9.5 in all three clones (warm amber film / greyscale scan / B/W
  macro / solarized-botanical grain / warm documentary office). Media plays on viewport enter,
  pauses on leave; loops are muted ~10s.
- **[v3] The mood spec must LEAD with the value key** — light-valued or dark-valued ground —
  before hue and texture. Cycle 3's single biggest deduction (hero 7/10) was a stand-in built
  dark-valued from a hue-only mood line ("solarized orange/lavender/sage duotones") when the
  original's film is light and airy: same hues, inverted value, opposite emotional register.
- **[v3]** Where the original's grain lives *inside* the assets (not a CSS overlay), bake
  grain into the stand-ins; an SVG turbulence overlay at placeholder fidelity is an accepted
  equivalent.

---

## Part II — Style axes (where the registers diverge)

Each axis names its poles with parameters. Pick a pole (or a deliberate intermediate) per
project; never blend unknowingly. **[v3]** The REPORT pole (data-editorial) is added wherever
cycle 3 produced parameters; axes A12–A15 are new.

### A1. AXIS: Typeface strategy
- **BRUTALIST pole — three-voice collision**: heavy grotesque/slab (must be genuinely
  **ultra-black w800–900** — a merely-bold fallback was cycle 1's largest deduction) + light
  italic high-contrast didone (w300, often outline/hairline) + monospace for every label/
  button/caption (uppercase, 12–16px, w400–500). The italic word physically overlaps the solid
  words; the didone carries *emotional* words, the slab carries *identity* nouns.
- **EDITORIAL pole — one serif, weight 400, and its true italic do all the talking**: a single
  high-contrast display serif (Louize-class; stand-ins Cormorant/Playfair — MUST have a real
  italic) at w400 only, plus one neutral grotesk (Beausite-class; 400/500) for 30px statements
  (ls −0.02em) and small UI. Hierarchy comes from size (10→168px) and roman-vs-italic, never
  from weight or color. The **casing voice**: ALL-CAPS roman alternating with *italic
  lowercase* connectives ("YOUR MOST *important* DRESS", "*Start your* COMMISSION").
- **[v3] REPORT pole — one grotesk at weight 500 does everything, a mono annotates**: a cool
  neo-grotesk (Beausite Classic-class; stand-ins **Archivo / Instrument Sans** — must carry a
  true 500; never a geometric Poppins-like) at **Medium 500 for ~95% of the page**, 400 for
  body/footnotes only; plus one mono (Geist Mono-class) locked to **13px/500/UPPERCASE**
  eyebrows and 18px superscript indices. Hierarchy comes from size alone. Casing voice:
  sentence-case headlines, Title-case UI labels, UPPERCASE mono eyebrows — no shouting except
  the eyebrows.
- Shared law across the axis: the flagship face is an **asset risk** — budget for the font
  (900-weight, true italic, or true 500 respectively) or the whole style downgrades.

### A2. AXIS: Display setting
- **BRUTALIST pole — carved blocks**: line-height **0.79–0.88**, letter-spacing **−1%**;
  headlines are solid slabs; ≥8vw with lh ≥1.1 loses the poster quality. Multi-line display
  never left-aligns as a block: line 2 indents **200–400px** right of line 1, composing
  diagonally; body in narrow 305–350px measures (~35 chars) stepped down-and-right
  (x 12→451→890, each block ~90–130px lower).
- **EDITORIAL pole — set stone**: line-height **1.0 exactly** (120px/120, 168px/168),
  tracking 0–+.06em (never negative on serif display); statements are *centered* blocks with
  ragged per-line lateral offsets (recorded as signed x per line, e.g. poem starts
  166/0/75/0/296); body centered in a 450px column.
- **[v3] REPORT pole — tight specimen**: line-height **0.95–1.0** (120/114, 50/50, 80/76);
  a **tracking slope** that tightens as size grows: **−6% at 120px, −4% at 50px, −1% at
  body 16px** — the slope itself is the system. Everything left-aligns to the frame or the
  42% column; no staggers, no centering; the drama is a hard two-column asymmetry (wide-left
  silence, right-column text) with the left half of whole sections deliberately empty.
- Shared law: sub-conventional line-height (≤1.0) on display type; the alignment *system*
  (diagonal-stagger vs centered-ragged vs hard-left grid) is the pole choice.

### A3. AXIS: Scroll engine & feel
- **BRUTALIST pole — layered lag**: Lenis smooth scroll **lerp 0.05** + per-tween
  **scrub 0.2–0.6** (defaults lerp 0.05, scrub 0.3); the page keeps settling ~1–1.5s after the
  wheel stops; reveals are scroll-scrubbed (windows ≈0.7–1.2 viewport-heights, entrance at
  ~top 85%); one-shot *timed* animations are reserved for curtains, badge/arc pops and slides.
  Two stacked smoothing layers ARE the signature.
- **EDITORIAL pole — native and quiet**: NO smooth-scroll library (adding one breaks the feel);
  reveals are **one-shot state machines** (IntersectionObserver class toggles at ~top 80%, CSS
  transitions); scrub exists only on fixed-layer furniture (logo dock, media mask scale, clip
  wipes, caption translateX), all LINEAR against scroll distance with a tiny lerp (~0.15–0.25)
  for silk.
- **[v3] REPORT pole — native + variant machine**: NO smooth-scroll library; a framework
  variant machine (Framer-class: IO variant switches + tweens) runs every one-shot entrance
  on ONE house bezier `cubic-bezier(0.44,0,0.37,1)` 0.5s / 0.2s delay / ~0.1s stagger; the
  only scroll-linked transform is **one oversized editorial image** spring-following scroll
  through its pin (~0.15 lerp feel); the chapter centerpiece is **pure CSS sticky** (no JS at
  all — see A7). Counters are the third motion class: linear-ish 1.0s count-ups.
- The spec must always name the engine (or its absence) — this axis is the biggest feel fork.

### A4. AXIS: Reveal grammar parameters
- **BRUTALIST pole**: chars/words/lines rise `yPercent 100→0`, scrub-bound; stagger sets the
  voice — **0.02** dense word-wave, **0.05 randomized** decoder/scramble for mono, **0.1
  randomized** the email climax types itself, **0.2** display letters landing one by one.
  Headline collisions breathe at two speeds: italic layer from **x:−60%**, solid from
  **x:+42%**, both → 0 on different scrub lags (**0.3 vs 0.6**). Identity moments use curtains:
  6 vertical panels wipe `scaleX 1→0` while the title relaxes `scaleX 1.1→1` + fade, 1.2s
  power1.inOut, 0.3s delay.
- **EDITORIAL pole**: line masks in **1.4s ease-out-expo, 80ms stagger** (+base .1–.55s by
  prominence); out **.3s ease-in-quad** same stagger (long-slow-in / quick-out asymmetry);
  italic words fade .6s out-sine instead of rising; swaps are two blocks sharing one slot
  (A-leaves-up + B-enters-below). Identity moments use the **aperture**: media never fades in,
  it opens — clip-path/mask from a centered window (0 → 15.6vw → full; 60% `polygon(20/80)` →
  full; square 453×453 → full-bleed), .7–1.4s, in-out-quint/expo — the same motif at 3 scales.
- **[v3] REPORT pole — one verb, five nouns**: everything arrives by sliding along one axis
  into a clipped box — text up through masks (+112px below a 76px clip), panels/asides in
  from a side (aside x1681→dock 1211; nav rows x−610→0), the nav down (−60→0) — all at
  **0.5s cubic-bezier(0.44,0,0.37,1), 0.2s delay, ~0.1s sibling stagger. Nothing fades
  alone.** Identity moment: the black band wipe + wordmark dock (see S13).
- Shared law: one in-spec + one out-spec per site, applied universally (S2).

### A5. AXIS: Easing voices
- **BRUTALIST pole**: quick power-out (0.2–0.5s) for everything the cursor touches; the slow
  S-curve **`cubic-bezier(0.785,0.135,0.15,0.86)`** ("brand ease") for 1s+ cinematic wipes;
  `power1.inOut` for curtains.
- **EDITORIAL pole** (defined as CSS vars): **out-expo `(.19,1,.22,1)`** for ALL text in;
  **in-quad `(.55,.085,.68,.53)`** for text out; **in-out-quint `(.83,0,.17,1)`** for aperture
  masks; in-quint `(.64,0,.78,0)` loader text exit; out-sine `(.61,1,.88,1)` fades; out-quart
  `(.25,1,.5,1)` UI opacity; underline `(.55,0,.1,1)`.
- **[v3] REPORT pole — a single house bezier**: **`cubic-bezier(0.44,0,0.37,1)`** for every
  entrance and hover wipe (0.3–0.5s band); counters run linear-ish 1.0s; springs (nav dock,
  photo follow) stay in the same decelerating family. One voice, total consistency — the
  minimal end of this axis.
- Shared law: S8 (no bounce; small named set; slow-in-fast-out asymmetry).

### A6. AXIS: Cursor
- **BRUTALIST pole — the cursor is an instrument**: two fixed layers — 6px accent dot (~0.08s
  follow) + 36px 1px-border ring in `mix-blend-mode:difference` (~0.3–0.5s power-out lag). On
  interactive surfaces: dot fades (0.2s), ring swells 1.5× (0.4s); on nav links the ring morphs
  into a 100px pill (0.5s). Plus the cursor-chasing media card: ~390×290 preview fades/scales
  0.9→1 (~0.38s), follows with ~0.4s lag + velocity-based skew/rotationY.
- **EDITORIAL / REPORT pole — default cursor, quiet furniture**: no custom cursor at all;
  interactivity is announced by the elements themselves (roll-swaps, underline draws, glowing
  pills, parked wipe twins). **[v3]** REPORT is a second data point on this pole (grab cursor
  on the draggable carousel is the only concession).
- This axis is binary in the evidence so far; do not ship a half-cursor.

### A7. AXIS: Ground & section transitions
- **BRUTALIST pole — rooms and hard cuts**: black and white sections butt directly, zero
  transition padding; **white rooms do work (facts, lists, proof); black rooms do belief
  (statements, manifesto)**; 90px white utility bands act as airlocks between dark acts; every
  dark room ends in an oversized conversational CTA with a **hover-completed answer word**
  ("Got Project?" → hover reveals "START", via the S11 mask-swap grammar). Page gutter ~12px on
  a ~1700px canvas
  (~0.7vw), effectively edge-to-edge, no max-width cap; loose 6-column feel with recurring
  x-positions; section-internal gaps 150–350px.
- **EDITORIAL pole — one continuous ground with fixed-stage vitrines**: a single beige page
  the whole way; drama comes from **fixed/pinned stages the page scrolls through**
  (fixed hero content layer, 100lvh pinned WebGL thesis stage, sticky stepper masks, sticky
  diptych column) — museum-vitrine storytelling for the first ~3.5 viewports. Containers cap
  1728 with 20px margins + 30px edge padding; 10px grid gap; 813px half-columns; 100–170px
  section margins.
- **[v3] REPORT pole — white ground punctuated by flat-color chapter rooms, stacked as
  curtains**: a white 16px-margin frame (container full-fluid, no max-width) carrying
  full-bleed interruptions (hero film, black quote band with a half-panel color split, black
  subscribe + footer), and at the centerpiece the **curtain under-stack**: three full-viewport
  single-flat-color slides (orange/lavender/sage), first `relative`, the rest `sticky top:0`
  with **descending z-index** — the current slide scrolls up and off like a curtain revealing
  the next already pinned bone-still beneath, ~250px dwell per hand-off, **no fade, no scale,
  no parallax — the flatness is the feel**. Two whole sections leave the left half empty white
  (silence as pacing). Section paddings 60–172px; total page ~12.5 viewport-heights.
- Shared: sections are viewport-scaled monoliths; total page ≈12–19 viewport-heights.

### A8. AXIS: Gallery composition
- **BRUTALIST pole — odd-offset squares**: perfect squares at two widths (509 & 390px ≈
  29.8/22.85vw) in 3 columns where no two horizontal neighbors share a top edge (vertical
  staggers 60–130px).
- **EDITORIAL pole — contact sheet**: strict 4×5 grid, portrait 4:5 cells 185×231, column
  pitch 363 (x 30/393/756/1119/1482), row pitch 344, wide 178px gutters as the look, a
  repeated wordmark label under every cell.
- **[v3] REPORT pole — overflow carousel**: one row of 460px cards at 16px gaps, first card
  on the frame edge (x16), the row running ~2.2 viewports past the right edge; paged by bare
  32×32 square arrows (card+gap = 476px per step) and pointer-drag; card anatomy is
  systematic (thumb 460×333 + 16px accent bar hard against its bottom + name 24/500 + title
  15/400 with a hover-swapped 340px description); state variants are token-level (grayscale
  thumb + "Coming soon" chip + "Get notified" row for unreleased items).
- Shared: S3 (no entrance animation) and S6 (exact counts, roster consistency) govern all
  three.

### A9. AXIS: Ornament flavor
- **BRUTALIST pole — drafting table**: striped SVG divider bands, concentric-arc glyphs,
  circular-text buttons, empty ruled rows, sticker badges, morph/wiggle hairline stripes;
  never decorative-soft.
- **EDITORIAL pole — gallery signage**: border-radius **0 everywhere** (rectangles + one
  perfect circle); wavy 19×3 squiggle hamburger bars as the single playful glyph; dual warm
  glow under every pill (`rgba(233,126,0,.04) −20px −4px 44px` + `rgba(157,20,20,.03)
  24px 10px 60px` — subliminal candlelight); a persistent 3D layer threading sculpture stage →
  coin → footer scene; micro-craft lives in pseudo-elements.
- **[v3] REPORT pole — table-of-contents skeleton**: border-radius 0 everywhere (now a
  2-site datum, EDITORIAL + REPORT — even form fields and 32×32 icon buttons are hard
  rectangles; the page reads as print specimen, not SaaS); every act opens with a **13px mono
  UPPERCASE eyebrow** ~24px below the section top; **18px superscript indices (01…07)** sit
  beside every big noun; 1px full-container rules top each slide; specimen tiles (white-
  bordered samples with tiny caption chips) float over the hero film — the audience displayed
  as a herbarium. Ornament = editorial apparatus.
- Shared: ornament is always systematic (S10), never generic decoration.

### A10. AXIS: Ambient life waveform
- **BRUTALIST pole — glitch**: hard on/off blinks, instant ~0.02s square wave, randomized
  infinite loops on small decorative elements (a soft eased pulse reads as a different, weaker
  idea — validated as a scored gap).
- **EDITORIAL pole — breath**: ≥4s-period eased opacity pulses at ≤.7 max (scroll cue .2↔.7
  over 5.2s; menu orb .04↔~.1 slow pulsate; 1.5–2s skeleton shimmer sweep); glows ≤4% opacity.
- **[v3] REPORT pole — still page, living data**: near-zero ambient loops on the chrome; the
  page's "life" is the slowly drifting grain film in the media slots and the **performed
  counters** (A12). Stillness everywhere else is the register.
- Shared law: specify the *waveform* (square vs eased, min/max, period — or "none") —
  "flickers" is not a spec.

### A11. AXIS: Emotional climax medium
- **BRUTALIST pole**: a plain email address set in giant italic didone (4.69vw), typing itself
  in with per-char randomized rise (stagger 0.1, scrub 0.2).
- **EDITORIAL pole**: a 168px CAPS serif poem (8 lines, per-line signed offsets, one rationed
  bleed) with a quiet author attribution.
- **[v3] REPORT pole — identity as the final exhibit**: the climax is the footer itself — a
  methodology stat trio counting up at 120px, then the wordmark redrawn at **1665px** full
  container width, closed by a **699×238 "2026"** year numeral. The brand and the data ARE
  the emotional payload.
- Shared: the climax is *not a button* — it is oversized, human/typographic (S9).

### A12. **[v3, new]** AXIS: Statistic staging (how numbers appear)
- **REPORT pole — numbers perform** (validated-by-clone; story/data-staging 9.5): every
  statistic enters as a **one-shot 1.0s count-up 0→N** the first time it is seen, at display
  scale (85px preface / 120px footer, weight 500), with affixes ("+") as **separate styled
  spans**; the magnitude sits above/beside a small caption in a fixed measure (22/500 w310;
  16/500 footer); triggers ride the section's entrance (counters fire when their card docks /
  on footer entry). Stats live on flat color cards or the black footer — staged like
  exhibits, one per surface.
- **BRUTALIST/EDITORIAL pole — numbers as ornament**: statistics and indices are static
  typographic furniture ("(01)", "[24]", "I.–VI.", step counters) — never animated counts.
- Rule for any pole: spec each performed number completely (size, target, duration, affix
  treatment, trigger, one-shot vs re-arm, magnitude/caption split) — see method v3 §2.

### A13. **[v3, new]** AXIS: Credibility furniture (borrowed proof)
- **REPORT pole — the logo wall** (validated-by-clone): directly under the hero, one row of
  **7 monochrome wordmark cells 234×104** (full container, no gaps, no rules), each logo a
  solid-black mark at natural size 77–117×14–35 — small marks centered in generous cells,
  strictly one color. Size discipline + monochrome is what keeps it editorial rather than
  corporate. A partner roster also recurs in the footer (names, not logos).
- **BRUTALIST/EDITORIAL pole — no borrowed proof**: neither agency/atelier page shows client
  logos; credibility is carried by the work itself (proof galleries, S9). Choosing to show a
  logo wall is a register decision — data/report pages earn authority partly through who
  participated.

### A14. **[v3, new]** AXIS: Where the designer's own color lives
- (Split out of S4, which stays cross-validated for palette *discipline*.)
- **BRUTALIST pole — subliminal accent**: one hue at ~6px-dot scale only; never text, never
  fills.
- **EDITORIAL pole — atmospheric accent**: hue only as 3–4%-opacity glows; the palette is
  ground-tone neutrals.
- **REPORT pole — flat color rooms**: three brand hues deployed as entire surfaces
  (full-viewport slides, nav chips, dropdown panels, accent bars) with black type on top;
  **one accent per surface**, zero gradients in the designer's own layer (gradient energy is
  the media's job).
- Shared law (from S4): tiny palette, written jurisdictions, richness lives in the media,
  color never animates except via opacity.

### A15. **[v3, new]** AXIS: Nav paradigm
- **BRUTALIST/EDITORIAL pole — transparent adaptive bar**: slim fixed header, no ground of
  its own, theme-swaps over the sections it crosses (S12 parameters).
- **REPORT pole — the chip strip** (validated-by-clone; live-tested in eval): a 56px strip of
  **four flush solid color chips** (black logo chip 160 / orange primary-action chip 536 /
  white fill / white pills 221+164), sharp corners, parked at translateY(−60) over the hero
  with a twin intro-nav handing off at hero exit (dock ~0.5s). Dropdowns are the nav
  **unfolding**: the chip's own color extends downward (nav height animates 56→907, panel
  h851) into a mega-panel laid out inside the collapsed nav's clipped DOM — 80px chapter rows
  / a 2-col 426×78 case grid, every row wearing the house wipe. Menus feel like the nav
  growing, never an overlay.
- Shared law (S12): the header always *reacts* to what it crosses; label feedback is the
  site's swap grammar (S11).

---

## Part III — Pipeline validations

- A blind implementer reached 8.3, 8.6 and 8.6/10 from written spec alone — *measured numbers
  with named mechanisms* (stagger values, scrub lags, easing curves, exact from/to values,
  signed per-line offsets, counter targets/durations) transfer feel reliably across three
  distinct registers.
- Motion grammar compressed into ~6 "generator rules" survived transfer essentially intact in
  ALL THREE cycles — the compression is the highest-value artifact of an extraction.
- The knowledge-first transfer test has now passed **twice in a row**: v1 knowledge carried
  the opposite-register EDITORIAL site, and v2 knowledge carried the third-register REPORT
  site, each through round 1. The method is style-agnostic; the *axes above* are what a
  presentation skill must choose between per project.
- **[v3]** Cycle 3 also validated extraction-under-hostile-conditions: with both sessions
  occluded (IO states frozen, screenshots unusable below the fold), a spec built from DOM
  geometry + framework runtime props + CDN media probes still produced a 9/10 motion and 9.5
  story score. The debt such a session leaves is *timing feel*, and it must be declared, not
  hidden (method v3 §4).
- The recurring loss patterns are (a) **asset risks** (font weight / true italic / true
  medium — name a guaranteed stand-in), (b) **mis-observed or under-pinned layout facts**
  (a header layout, a menu measured at the wrong viewport, a flagged range never pinned),
  and **[v3]** (c) **spec self-contradictions and media-value omissions** (an anchor that
  lands text on a same-color panel, child widths exceeding their column, a hue-only mood line
  that lets a stand-in invert the value) — all extraction hygiene, addressed in
  `extraction-method-v3.md` §§2, 4, 5.
- Carried v1/v2 items not restated elsewhere: the persistent floating CTA pill that re-docks
  into in-flow bands (**observed-once**, BRUTALIST pole — the clone skipped it; minor loss);
  loader progress with eased ~1.2s power1.out jumps and hold-at-full before release
  (**cross-validated (2 sites)** via S7); the EDITORIAL POI hotspot pattern (+ markers → white
  card, staggered lines in 1.4s out-expo ×.1s / out .35s reverse 60ms, close ✕ rotates
  −45°→0) — **observed-once** (CSS-proven, clone-implemented, not observed live on the
  original).
- **[v3]** Carried cycle-3 items pending live confirmation (both sessions occluded): dropdown
  open spring-vs-tween, hover-wipe timing feel, carousel drag physics, preface photo
  end-state — all built to defaults-by-instruction and not yet adjudicated; one visible-tab
  pass on the original would settle them.
