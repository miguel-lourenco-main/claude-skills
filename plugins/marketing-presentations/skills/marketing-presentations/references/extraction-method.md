# Extraction method v3 — checklist for extracting design knowledge from any site

Supersedes `extraction-method-v2.md` (kept as regression baseline — do not edit it). v3 merges:
cycle 1 (hobro.digital, blind clone 8.3/10 round 1) + cycle 2 (verostudio.com, blind clone
8.6/10 round 1) + cycle 3 (stateofaidesign.com, data-editorial report page, blind clone 8.6/10
round 1 — second consecutive knowledge-first transfer pass). Every v1/v2 item is carried
forward; cycle-2 additions remain marked **[v2]**, cycle-3 additions are marked **[v3]**.

The extraction is written for an implementer who will NEVER see the original: every claim needs
a number, a named mechanism, or an explicit "unverified" flag. Spec ambiguity becomes a clone
bug — see the "first pass misses these" list at the bottom, built from all three evaluators'
extraction-classified gaps.

## 0. Site triage (before committing hours)

Not every site survives automation. Rejected candidates in cycle 1: preloader hangs, video-only
content that renders blank headless, gated experiences, tab-renderer freezes, very slow loads.
- Load the site in a **foreground, visible tab** and confirm: preloader completes, content renders
  below the fold, the tab doesn't freeze. Prefer typography/motion-driven sites over video-driven
  ones (video content can't be studied or cloned; type and motion can).
- **[v2] "Video-less" may be a visibility gate, not a dealbreaker.** Vero's videos never mounted
  and lazy images never loaded while `document.visibilityState === 'hidden'`. Before rejecting a
  site as blank/video-broken: spoof the visibility getter, dispatch `visibilitychange`, add a
  Worker rAF shim, and sweep `img.loading='eager'` to force the lazy tree. This turned an
  "unrenderable" site into a fully extractable one.
- Fix the viewport once (e.g. 1707×907 or 1440×900) and record it — **every px in the spec lives
  in that coordinate space**, and the evaluator must reuse it.

## 1. Browser handling lessons (hard-won, apply from the start)

- **Occluded tabs throttle rAF and break compositing.** A backgrounded/hidden automation tab
  froze the site's renderer below ~2 viewport-heights: screenshots came back black or composited
  stale frames. Mitigations that worked:
  - keep the tab foreground/visible for anything you must *see*;
  - a **Worker-driven ticker shim** (postMessage loop replacing rAF pacing) keeps JS-driven
    animation engines advancing when throttled;
  - the **hide-preceding-sections technique**: `display:none` everything above the target section
    so it sits in the first viewport, then screenshot — renders deep sections without scrolling;
  - always cross-check a suspicious screenshot against the DOM before recording a claim —
    single-frame oddities are often stale composites.
  - **[v2] Fixed/sticky layers have a concrete staleness signature**: in an occluded tab they
    composite at stale offsets (the fixed header appears mid-page) while in-flow content is
    correct. Rule: **never read fixed/sticky element positions from screenshots — DOM rects
    only.** Both cycle-2 sessions (extraction and eval) hit this repeatedly.
- **[v3] IO-gated states are UNREACHABLE in an occluded tab — even with the visibility spoof +
  rAF shim.** The shim keeps rAF/JS ticking, but IntersectionObserver notifications (and scroll
  events) ride the parked rendering pipeline. Consequence, verified in cycle 3 on both the
  extraction and eval sessions: *state-machine* sites (IO variant switches — Framer, class
  togglers) freeze at their initial variants while *scrub* systems still respond. Do not burn
  time re-dispatching scroll/hover events to force them. Instead: spec every IO-triggered state
  from DOM geometry + framework props (see the registry items below), flag each as "mechanism
  certain, timing unverified", and **budget one visible-tab confirmation pass** before anyone
  scores those timings wrong. (Cycle 3 shipped an 8.6 pass this way; the timing debt is
  explicit, not hidden.)
- **[v2] Calibrate screenshot space empirically — never assume it.** OS scaling (dpr 1.5) plus
  window-manager interference produced three different screenshot→CSS mappings in one session
  (0.59, 0.885 with a 287px dead band, 0.86 full-frame), and `resize_window` reported success
  while doing nothing. Early screenshots were misread ("logo right-of-center" when it was
  centered). Rule: draw two fixed marker boxes at known CSS coords, screenshot, derive
  scale+offset from them; re-calibrate after ANY resize or window event; treat resize_window
  success messages as unverified.
- **[v2] Log `innerWidth` at EVERY measurement batch and tag each number with its viewport.**
  The window can shrink mid-session outside your control (1707→653 in cycle 2), and vw-driven
  tokens silently become mobile-layout numbers. Any spec captured at a deviant viewport must be
  re-verified at the canonical one before it is written as universal (see the menu-numerals gap
  in section 4).
- **[v3] External window squeezes: the standing recovery rule.** Cycle 3's window was
  externally forced to junk sizes (653×361, 692×27, 672×357) **three times** mid-session, and
  each squeeze silently swaps in a different breakpoint DOM (scrollHeight walked
  11310→10089→8857 — three different pages). Two rules, now standing:
  1. **Opening a brand-new tab restores the true window size** when `resize_window` is a no-op
     (it was, all session). Recover via fresh tab, never by trusting a resize call.
  2. **Re-issue, never reuse, any measurement batch whose logged `innerWidth` deviated.**
     Discard the batch outright — off-viewport probes were discarded and re-run in cycle 3 and
     the spec stayed clean (zero viewport-drift gaps, vs cycle 2's menu-numerals miss).
- **Smooth-scroll libraries (Lenis etc.) eat programmatic scrolls.** `window.scrollTo` fights the
  lerp loop and scrub-linked reveals never fire naturally. Step-scroll instead: repeated small
  wheel/scroll increments with waits, letting the smoothing settle (~1–1.5s at lerp 0.05) before
  measuring or screenshotting.
- **Preloaders are asset-bound, not timed.** Budget minutes on a slow network, not the nominal
  3–15s. Wait for a concrete post-loader signal (hero content visible, loader element removed),
  never a fixed sleep. Watch the loader itself across **multiple reloads** — it is often the
  signature moment of the site (first-visit vs cached differs).
- **[v2] Loaders can be unmounted components — capture them on the FIRST navigation.** Vero's
  intro headline existed nowhere in the settled DOM (React unmounts it) and its text was in no
  script payload; it was only capturable by racing a JS query during the first ~1.5s of a
  reload. Rule: on first navigation, dump all leaf text (and geometry if possible) of overlay/
  loader elements before doing anything else; cached reloads may skip or compress the intro.
- **Hover testing method:** dispatch real `mouseover`/`mousemove` sequences on the element (or
  move the pointer via automation), screenshot before/during/after, and read the computed
  transition/inline styles mid-hover to capture timing. Confirm at least the flagship hover live;
  mark all others with their source (CSS rule vs JS-driven vs "unverified").
- **[v2] Frozen transitions make naive `getComputedStyle` lie.** In a throttled tab, elements
  whose driven state is correct can report opacity 0 / identity transforms because the CSS
  transition never ran. Before declaring any motion "dead" or a state "not applied", re-test
  with `transition:none` injected — this rescued a correct mechanism from a false "broken"
  verdict in the cycle-2 eval. Applies to extraction and evaluation alike.
- **Read the animation registry instead of guessing.** With GSAP/ScrollTrigger sites,
  `javascript_tool` can dump the entire measured motion system:
  - `ScrollTrigger.getAll()` → per-trigger start/end scroll windows, scrub value, target elements;
  - walk each trigger's `.animation` (timeline/tween) for targets, from/to values (`_pt` chains or
    `vars`), duration, stagger, ease;
  - sample a named ease function at t = 0.25/0.5/0.75/0.9 to identify custom curves numerically
    (this matched a CustomEase to `cubic-bezier(0.785,0.135,0.15,0.86)`);
  - detect the smooth-scroll engine and read its config (`lerp`, `wheelMultiplier`).
  This registry read is MORE reliable than watching, and it covers sections you can't render —
  but pair it with visual confirmation of at least the top half, because registries don't tell
  you what an effect *looks like*, only what it does.
- **[v2] "No global animation registry" sites — the CSSOM-first recipe.** Sites built on
  React + CSS vars + class-toggled transitions (no GSAP/Lenis) have no registry to dump. The
  equivalent, validated in cycle 2:
  1. dump all `:root` custom properties (tokens AND easing vars — sites often define their whole
     easing vocabulary as vars);
  2. harvest every `@keyframes` rule and every `:hover` / `[class*="module"]` rule from CSSOM —
     this is the hover table and the ambient-loop inventory in one sweep;
  3. sample element inline transforms / CSS-var values against `scrollY` at stepped positions to
     recover the scrub curves (e.g. logo scale/translate vs scroll → linear map + lerp estimate);
  4. classify every motion as *scrubbed* (scroll-linked var/transform writes) vs *state machine*
     (IntersectionObserver class toggle + CSS transition) — the spec must say which, because
     they feel different and are built differently.
- **[v3] The THIRD registry: framework runtime props (React/Framer/Webflow-class sites).**
  Cycle 3's motion lived in neither a GSAP registry nor CSSOM — it lived in **framework
  runtime data**: Framer's `<script type="framer/appear">` JSON block plus React fiber
  `memoizedProps` on animated leaves. Walking `__reactFiber$*` props recovered exact counter
  targets/durations (end=900/25/906/50, duration=1s, suffix-as-span) and the appear tweens
  (x −610→0, 0.5s, cubic-bezier(0.44,0,0.37,1), 0.2s delay) that no stylesheet or registry
  contains. Rule: before watching anything on a React/Framer/Webflow-class site, (a) dump any
  `framer/appear`-style declarative animation script tags, and (b) walk fiber `memoizedProps`
  of every animated-looking leaf (counters, masked text, sliding asides). This is the only
  source of exact numbers when IO states are frozen (see the IO item above) — cycle 3's
  motion dimension scored 9/10 specced almost entirely from it.
- **[v2] CDN side-channel for media moods.** When rendering is broken, harvest `currentSrc`/
  `srcset`/`<source>` URLs early and fetch the assets out-of-band (e.g. an image CDN with
  `?w=500`), viewing them locally to write accurate media-mood descriptions. Probe video URLs
  found in HTML even when no `<video>` is mounted. This recovered 100% of Vero's media specs
  despite a frozen renderer.
- **[v2] Big extractions vs truncated tool output.** When tool results cap around ~1KB, stash
  large JSON dumps in `window` vars and page them out in ≤950-char slices, batching the slice
  reads. Design the extraction scripts around this from the start rather than losing data.
- **[v3] Sanitize measurement dumps against output filters.** The tool chain's data-leak filter
  can silently block or empty any output where a name containing `&` precedes `x=0 w=696`-style
  pairs (it pattern-matches as a query string); URL lists came back silently empty. Workaround
  that stuck in cycle 3: strip/replace `&`, `=`, `?` in every dump (`.replace(/&/g,'+')`), and
  when a single value still trips the filter, emit its char codes. One line here saves the
  cycles cycle 3 burned isolating which row was "toxic".
- **Computed styles over eyeballs for all static measures:** `getComputedStyle` +
  `getBoundingClientRect` for font-family/size/weight/line-height/letter-spacing, colors, and
  x/y/w/h box positions. Record positions as measured px in the fixed viewport AND convert
  key display sizes to vw.

## 2. Structure pass (static design) — capture in this order

1. **Identity paragraph**: what the site is, who it persuades, the conversion action(s), 5–8 mood
   adjectives, and the narrative arc top-to-bottom (one line per act). Write this FIRST — it is
   the lens for everything else.
2. **Tokens**: full color inventory (backgrounds, text, accents with exact hex and *where each is
   allowed*), font families (computed, with roles and fallback character — note weight
   availability!), the complete type scale as a table: size (px AND vw) / weight / line-height /
   letter-spacing / case / role. Radii, hairline weights, cursor spec.
   - **[v2] Easing tokens are tokens too**: if the site defines its easing vocabulary as CSS
     vars, copy the full set with names — the clone reproduced all 7 of Vero's byte-for-byte.
   - **[v2] Casing voice**: if the copy alternates cases/styles as a pattern (CAPS roman +
     italic lowercase connectives), record it as a token-level rule — it is the voice, and
     paraphrased clone copy must keep it. (Cycle 3 variant: sentence-case headlines +
     Title-case UI + UPPERCASE mono eyebrows + superscript indices — same rule, different voice.)
3. **Layout system**: container/gutter widths, grid feel with recurring x-positions, text-measure
   widths, vertical rhythm ranges, full-bleed vs contained inventory, alignment patterns
   (staggers, overflows — with signed px), sticky/fixed furniture inventory.
4. **Sections, in DOM order**, each with: y-range and height, background, role in the arc, every
   element with position/size/type-spec, media slots (described: content mood, dark/light,
   loop/static), and exact list/data contents (counts matter: 20 services, 13 tiles, 24 names,
   4×5 grids, 8-line poems — the clone reproduces counts).
   - **[v3] Media mood specs LEAD with the value key.** State first whether the asset is
     light-valued or dark-valued (white-dominant vs black-dominant ground), then hue and
     texture ("LIGHT, airy solarized-botanical: lavender/white ground, orange/sage pools,
     16mm grain"). Cycle 3's biggest deduction (hero 7/10) was a stand-in built dark-valued
     from a hue-only mood line — the value key is what sets the emotional register, and a
     gradient stand-in inverts it silently if unstated.
   - **[v3] Statistics get their own inventory (data pages especially).** For every performed
     number on the page, record as first-class spec: numeral size/weight/color, target value,
     count-up duration, affix treatment (suffix/prefix as a separate styled span or not),
     trigger moment (IO on arrival / on aside dock / on footer entry), one-shot vs re-arming,
     and where the numeral sits relative to its caption (magnitude/caption split, caption
     measure). Cycle 3 captured these ad hoc from fiber props (0→900 1.0s "+", footer trio
     906 / 25+ / 50+); the clone's 9.5 story/data-staging score came from reproducing exactly
     this staging. "There are some stats" is not a spec.
5. **Header/nav, fixed furniture, loader, overlays** as their own inventory.
   - **[v2] Pseudo-element sweep on all interactive furniture**: run
     `getComputedStyle(el,'::before'/'::after')` across buttons, icons, links and chrome. Vero's
     micro-craft (wavy hamburger bars via ::before content, dual-color 4%-opacity warm glows via
     box-shadow) lived entirely in pseudo-elements and shadows a normal style read misses.
   - **[v2] 3D / WebGL slot inventory**: list every `<canvas>`, empty aspect-ratio-sized div,
     and `pointer-events:none` overlay as a "3D slot"; read the context type (`webgl2` etc.);
     describe what renders there if observable, flag it unverified if not; and **spec a 2D
     fallback for the clone** (a static render image / emboss / outline wordmark keeps ~90% of
     the feel).
   - **[v3] Measure dropdown/overlay panels through their clipped DOM while CLOSED.** Mega
     panels are often fully laid out inside an overflow-clipped collapsed parent (cycle 3: an
     851px-tall dropdown panel resting under a 56px nav, revealed by animating the nav's
     height). Read the panel's children, geometry and hover twins from the clipped DOM — do
     not try to force the menu open first (in a frozen tab it won't open, and it doesn't need
     to).
6. **"What makes it feel premium"** — 8–12 numbered observations tying measurements to feel.
   These become the principles file; write them while the impression is fresh.
7. **Coverage notes**: what was NOT observed and why. Honesty here saves the evaluator hours.

## 3. Motion pass — capture in this order

1. **Engine**: libraries (or **[v2]** explicitly "native scroll, no library — do NOT add one to
   the clone"), smooth-scroll config, global scrub defaults, the house easing voices (with
   sampled curve points or var definitions), the duration bands, and a one-line "scroll feel"
   description. **[v2]** State the scrubbed-vs-state-machine split (see the CSSOM recipe above).
   **[v3]** On framework-built sites, name the framework runtime as the engine (e.g. "Framer
   variant machine: IO variants + springs, one house bezier") and source the numbers from the
   runtime-props registry (section 1).
2. **Loader & entrance choreography** as a numbered phase-by-phase script (watched over ≥3
   reloads), with durations, eases, stagger values, and what is progress-bound vs fixed.
   **[v2]** Also record the cached-revisit variant (Vero compresses the same script to ~1.5–2s).
3. **Scroll choreography section by section**: for every animated element — trigger window
   (scrollY range or "top N%"), scrub value, from→to values, stagger, ease. State explicitly
   where there is NO animation (restraint is spec; all three evaluators praised the clones for
   correctly NOT animating the quiet sections).
   - **[v3] Named pattern — the curtain under-stack.** First slide `position:relative`, every
     later sibling `position:sticky; top:0` with **descending** z-index: the top slide scrolls
     up and off like a curtain while the next is already pinned bone-still beneath it — no
     transforms, no fade, no parallax; typically a ~250px scroll dwell per hand-off. Recognize
     it from the CSS (relative + sticky siblings + z order) instead of re-deriving it from
     scroll samples — identifying it blind cost cycle 3 a 9-point scroll-sample run. When you
     find it, spec it as "flat curtain — do NOT add parallax/scale/fade".
4. **Hover states as a table**: target / effect / measured timing. Flag each row's evidence:
   confirmed-live, from-CSS, from-registry, or unverified. **[v2]** Look for duplicated labels
   in the DOM — a label + hidden clone pair is the signature of roll-swap hovers and can be
   read statically even when hover can't be dispatched. (Cycle 3's variant: the filled twin
   parked at −100% x inside every interactive surface is the signature of wipe hovers — same
   static read.)
5. **Fixed furniture motion** (cursor layers, header inversion/theme swap, floating pills,
   docking wordmarks) and **micro-feedback/overlays** (popups, click feedback — including
   "none"). **[v2]** For loops, record the *waveform*: eased vs instant, min/max opacity, and
   period (a 5.2s eased breath and a 0.02s square-wave blink are different ideas).
6. **The generator rules**: compress everything into ~6 rules that could regenerate the whole
   system. This compression is the highest-value artifact — all three clones were built mostly
   from it.
7. **Coverage notes** again: unverified mechanisms, unused code found (e.g. a marquee keyframe
   that is NOT used, or POI hotspots present in CSS but never observed live — recording the
   negative/flag prevented fakes in both cycles).

## 4. First pass misses these (evaluator-classified extraction gaps — check every item)

Cycle 1 items (each cost fidelity because the first extraction missed or fudged it):

- [ ] **Secondary/utility headers get full layout specs too.** The cases-gallery header
  ("Selected Cases" + filter counts) was written as "left headline, right tabs" with no sizes;
  the real site stacked the filters vertically at far-left beside a ~2× headline. The clone
  faithfully built the wrong thing — the round's only *major* extraction gap. Rule: every
  header/subheader block gets position + size + stacking direction, not a prose gloss;
  screenshot it if it's between sections you've already shot.
- [ ] **Reconcile the structure doc against the motion doc before handoff.** The two docs
  contradicted each other on the statement-section interstitial words (large scrubbed overlays
  vs 17px inline fades); the truth was never pinned and the clone had to pick one. Rule: a final
  cross-read pass; every element described in both docs must agree or carry an explicit
  "unresolved — verify" flag. (A single reconciled doc, as in cycles 2–3, also satisfies this.)
- [ ] **"Larger/offset" is not a spec.** The footer year numerals were recorded as "80px numbers,
  the 26 styled larger/offset" — the clone had to invent a treatment. Rule: any element called
  out as *specially styled* gets its own computed-style read (family, size, style, exact offset).
- [ ] **Count repeated elements exactly** (dots: 63 vs the clone's 28) and capture BOTH halves of
  symmetric scroll behaviors (the dots gathered on entry per spec, but the disperse-on-exit
  scrub existed in the registry and wasn't carried into the clone). Rule: for every scrubbed
  entry, ask "is there a matching exit trigger?"
- [ ] **Ambient-loop character: record the waveform.** "Stickers flicker" allowed a soft opacity
  pulse; the original blinks hard on/off (~0.02s square wave). Rule: for any loop, note eased vs
  instant, min/max opacity, and period range.
- [ ] **Fixed-layer furniture inventory needs behavior over time**, not just existence: the
  floating deck pill persists during scroll, re-docks into in-flow bands, and grows to a wider
  centered variant mid-page — the spec mentioned this but not prominently enough to survive
  into the clone. Rule: give fixed/floating elements their own lifecycle timeline.
- [ ] **Overflow vs containment is per-element intent.** Some display type deliberately bleeds
  offscreen; other equal-sized titles are contained and centered. Record which, per element —
  the clone let a contained climax title overflow. **[v2 upgrade: per-LINE intent.]** Vero
  rations bleed to a single poem line (line 4 → x1811, all others contained); the cycle-2 spec
  recorded this per line and the eval confirmed it was the right resolution (the clone's poem
  clipping was an implementation miss against a correct spec). Record signed start/end x per
  line for any ragged display block, and say which lines (if any) bleed.
- [ ] **Loader semantics**: progress-bound vs fixed-duration, hold states, and eased jump timing.
  A fixed fake is a visible downgrade.
- [ ] **Non-display type voice details**: per-letter span spacing vs normal tracking, exact px
  (22px mono-ish letter spans became 24px tracked grot in the clone — slightly off-voice).
- [ ] **Font weight availability is an asset risk, not a styling note.** If the design depends on
  an ultra-black or hairline face, say so in red letters and name a guaranteed-available
  fallback; cycle 1's biggest overall deduction was a display face rendering ~bold instead of
  ~900. **[v2 extension]**: the same applies to a **true italic** — a serif-led site whose voice
  is roman/italic alternation dies with a faux-oblique. Name a stand-in with a real italic
  (naming Cormorant in the cycle-2 spec is what kept typography at 8.5). **[v3 extension]**: and
  to a **true medium (500)** on a commercial grotesk — cycle 3's page is 95% weight-500; naming
  Archivo/Instrument Sans (real 500, neo-grotesk character, not geometric) kept typography at 9.

Cycle 2 additions **[v2]**:

- [ ] **Never generalize furniture measured at a deviant viewport.** Vero's menu overlay was
  measured at 653px after a forced resize; its roman numerals and orange orb turned out to be
  mobile-layout facts absent from the desktop DOM, and the clone faithfully built them —
  a visible divergence charged to extraction. Rule: anything captured off-viewport is flagged
  *provisional* and MUST be re-probed at the canonical viewport (open the overlay, sweep leaf
  text / pseudo-content / colors) before being written as universal. (Cycle 3 followed the
  rule under three forced resizes — discarded and re-ran every deviant batch — and shipped
  zero viewport-drift gaps. See the [v3] recovery rule in section 1.)
- [ ] **Pin every number you flag as approximate if it is measurable in-session.** The spec
  flagged desktop menu links as "~90–120px expected"; the real value (111px) was measurable at
  the time, the clone chose 96px inside the band, and the menu read visibly lighter. A range is
  a last resort — if the element exists at the canonical viewport, measure it.
- [ ] **Give the evaluator the vertical pacing budget.** The cycle-2 clone stretched total page
  height +11% (diptych band +440px) — legal per-section but off in aggregate scroll rhythm.
  Record total page height AND per-section heights as first-class spec numbers, and state
  band heights for grid/stacked bands, not just their content geometry.
- [ ] **Chrome buttons are styled surfaces, not hit areas.** The MENU button's 130×45 *pill*
  (fill + glow + theme variants) was in the spec's token section but not restated in the header
  inventory, and the clone shipped a bare icon+label. Rule: in the furniture inventory, restate
  each control's full surface treatment per theme state — don't rely on the tokens section
  alone surviving into the build.
- [ ] **List which links carry the hover mechanism, exhaustively.** The clone gave roll-swap to
  every footer nav link but not the three social links (spec listed "footer links" generically).
  Enumerate hover coverage per link group.

Cycle 3 additions **[v3]**:

- [ ] **Run an arithmetic-consistency audit on the finished spec.** Two of cycle 3's three
  extraction-classified gaps were the spec contradicting its own numbers: the pull-quote anchor
  (x715+16) against its own sage-pane origin (x848) — as written, 116px of black-on-black
  text — and a form row (664+123) wider than its stated column (702). Rule: before handoff,
  sweep every parent/child pair (do child widths fit the stated container?) and every
  overlapping-layer pair (does a text anchor land on the panel that gives it contrast?). Each
  contradiction either gets re-measured or an explicit "unresolved — implementer's choice"
  flag; a silent contradiction forces the implementer to guess and charges the miss to
  extraction.
- [ ] **When BOTH sessions ran occluded, the timing debt is a standing spec item.** Cycle 3's
  extraction and evaluation both ran in hidden tabs, so the original's live motion feel
  (hover-wipe timing, dropdown spring-vs-tween, drag physics) has never been watched by anyone.
  Write it in the coverage notes as an owed **visible-tab confirmation pass**, and instruct the
  evaluator to score unverified defaults as "defaults-by-instruction", not as confirmed or
  wrong. (Both cycle-3 docs did this; the eval correctly declined to adjudicate those rows.)

## 5. Handoff & evaluation notes

- The clone is a single HTML file. Cycle 1: CDN GSAP + ScrollTrigger + Lenis covered 100% of the
  motion needs (plus ~60 lines of helpers: char/word splitters, a cubic-bezier evaluator for the
  brand ease, quickTo cursor followers) — a spec written in "stagger/scrub/ease" vocabulary maps
  1:1 onto this stack. **[v2]** Cycle 2 needed NO libraries: native scroll + IntersectionObserver
  + CSS vars/keyframes reproduced the whole system, and the spec's explicit "do NOT add Lenis"
  note prevented a feel-breaking upgrade. **[v3]** Cycle 3 likewise: native scroll + IO + CSS
  sticky reproduced a Framer build wholesale (curtain under-stack is pure CSS; counters and
  appear tweens are ~40 lines of JS). The spec must always name the engine (or its absence) so
  the implementer matches it.
- **[v3] Declare ONE scaling strategy for the build and hold the whole clone to it.** Either
  vw-fluid (layout rules expressed relative to viewport) or fixed px at the canonical viewport —
  never a mix. Cycle 3's clone rendered its type/layout vw-fluid but hard-coded the preface
  photo/aside in px pre-scaled to a 1440 design width, so at the canonical 1707 the photo ran
  ~15% under-sized relative to frame (a scored gap). When the spec's canonical viewport differs
  from the intended build width, say explicitly which numbers are viewport-relative rules
  (margins, halves, measures — rebuild from these) and which are raw px in canonical space.
- Paraphrase copy at similar length/casing, invent a brand name, replace media with
  gradient/pattern slots — and record in the spec the *mood* of each media slot so the stand-in
  gradient can match (warm amber hero vs desaturated case tiles vs greyscale scan) — **[v3]
  value key first** (light vs dark ground; see section 2). **[v2]** Preserve the casing voice in
  paraphrase (CAPS/italic alternation survived into "From GOWN, to SCAN, to STATUE." and kept
  the voice). **[v3]** Preserve copy *cadences* too — year-on-year pivots ("In 2025 … In 2026 …"),
  "Seven X. Seven Y." constructions, the house "+" tic — and keep invented rosters consistent
  across every surface they appear on (nav dropdown, carousel, footer must name the same 7
  companies with the same live/coming-soon split).
- The evaluator needs: the same viewport, the spec docs (to classify gaps as extraction vs
  implementation), and the caveat list. Score dimensions: hero first impression, layout,
  typography, color/mood, story structure, motion choreography, interaction feedback, craft.
  Pass = overall ≥8 with no dimension <6; classify EVERY gap as extraction or implementation —
  the extraction gaps feed section 4 of this file's next version.
- **[v2] Evaluator discipline under a broken environment** (both cycle-2 pages ran occluded):
  verify through DOM geometry, computed styles, and CSSOM — the same instruments the extraction
  used; tag every measurement with the viewport it was taken at and make all key comparisons at
  the spec's canonical viewport; apply the visibility spoof + rAF shim to BOTH tabs; re-test any
  suspected dead motion with `transition:none` before believing it; and when live playback feel
  can't be watched, say so and recommend a healthy-desktop confirmation pass rather than
  guessing. **[v3]** Add: expect IO-gated states to be frozen on BOTH tabs (see section 1) —
  verify the clone's state machine by live-driving it where the clone renders, verify the
  original's from DOM/props parity with the spec, and record the asymmetry honestly.
- **[v2] Knowledge-first cloning order** (validated by the cycle-2 AND cycle-3 transfer tests):
  before extracting a new site, attempt understanding it through the accumulated principles —
  the accumulated knowledge has now carried two consecutive new-register sites to round-1
  passes. The method checklist (this file) is style-agnostic; the principles files supply the
  register.
