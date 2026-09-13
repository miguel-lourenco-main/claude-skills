# Implementation playbook — building a marketing-page-feel HTML presentation

Companion to `design-principles.md` (which chooses WHAT to build per style axis). This file is
HOW: the validated single-file mechanics, distilled from three clones that each passed blind
evaluation at 8.3–8.6/10 (BRUTALIST / EDITORIAL / REPORT poles). Numbers below are the
validated ones — reuse them verbatim unless the visual script overrides them.

---

## 1. Single-file skeleton

One `.html` file, in this order:

```
<!DOCTYPE html><html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
      <!-- REPORT pole used width=1440 + body{min-width:1240px} — desktop-first is allowed -->
  <title>…</title>
  <link> Google Fonts (preconnect ×2 + one css2 link)   — only if the pole needs a real face
  <style>
    :root{ ALL tokens }   /* colors, easings as cubic-bezier vars, font stacks, vw type vars,
                             frame margin / gutter, grain data-URI */
    reset: *{margin:0;padding:0;box-sizing:border-box}  (+ border-radius:0 on EDITORIAL/REPORT)
    shared utilities (.mask/.rl, .wipe, .roll, .eyebrow, .hairline, .grain, media placeholders)
    per-section CSS, in page order, one banner comment per section
    @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style>
</head>
<body>
  fixed chrome first (cursor layers, loader/intro overlay, header/nav)
  <main> sections in narrative order </main>
  floating furniture (hover cards, popups) after main
  CDN <script> tags (BRUTALIST only), then ONE inline <script> — the whole engine — at the end
</body></html>
```

Rules that held across all three:

- **Tokens as CSS vars.** Every color, every easing curve, the frame margin, the grain URI.
  Easing vars are named by voice (`--out-expo`, `--bez`, `--ease-brand`), not by element.
- **Viewport strategy: desktop-first 1440×900.** Display type in **vw** (so composition
  survives viewport changes); labels/body/UI in **px**. Layout anchors as vw or % vars
  (e.g. `--colx:42%`), gutters in px (`--m:16px` / 12px / 30px). Guard body with
  `overflow-x:clip` (bleeds are deliberate; horizontal scrollbars are not).
- **CDN policy:** BRUTALIST pole only —
  `cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js` + `ScrollTrigger.min.js` +
  `cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js`. EDITORIAL and REPORT poles: **zero
  libraries** — adding a smooth-scroll lib to those registers breaks the feel (axis A3).
- The engine script is an IIFE (`(function(){'use strict';…})()` on the no-lib poles); wire a
  `prefers-reduced-motion` check that snaps everything to end state.
- Dev hook worth keeping: `?jump=N` query param that skips the loader and lands at scrollY N.

---

## 2. The three engine patterns (pick ONE per page — axis A3)

### 2a. BRUTALIST — Lenis + GSAP scrub (layered lag IS the signature)

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js"></script>
<script>
gsap.registerPlugin(ScrollTrigger);

/* brand ease usable from GSAP: Newton-solved cubic-bezier */
function cubicBezierEase(p1x,p1y,p2x,p2y){
  function A(a,b){return 1-3*b+3*a} function B(a,b){return 3*b-6*a} function C(a){return 3*a}
  function calc(t,a,b){return ((A(a,b)*t+B(a,b))*t+C(a))*t}
  function slope(t,a,b){return 3*A(a,b)*t*t+2*B(a,b)*t+C(a)}
  return function(x){ if(x<=0)return 0; if(x>=1)return 1; let t=x;
    for(let i=0;i<6;i++){const s=slope(t,p1x,p2x); if(s===0)break; t-=(calc(t,p1x,p2x)-x)/s;}
    return calc(t,p1y,p2y); };
}
const brandEase=cubicBezierEase(0.785,0.135,0.15,0.86);   /* the 1s+ cinematic voice */

/* two stacked smoothing layers: Lenis lerp 0.05 under per-tween scrub 0.2–0.6 */
const lenis=new Lenis({lerp:0.05,smoothWheel:true,wheelMultiplier:1});
lenis.on('scroll',ScrollTrigger.update);
gsap.ticker.add(t=>lenis.raf(t*1000));
gsap.ticker.lagSmoothing(0);

/* standard scrub reveal helper: chars/words rise out of masks, paced by scroll */
function scrubRise(targets,trigger,{stagger=0.02,scrub=0.3,start='top 95%',end='top 40%'}={}){
  gsap.set(targets,{yPercent:102});
  gsap.to(targets,{yPercent:0,ease:'power2.out',stagger,
    scrollTrigger:{trigger,start,end,scrub}});
}
/* usage, with the splitter from §3: */
scrubRise(splitChars(el),'#statement',{stagger:0.02});               // dense word-wave
scrubRise(splitChars(t),'#title',{stagger:0.2,end:'top 40%'});       // letters land one by one
scrubRise(splitChars(email),'#email',{stagger:{each:0.1,from:'random'},scrub:0.2}); // types itself

/* headline collision: two layers, two scrub lags */
gsap.fromTo('#italic-word',{xPercent:-60},{xPercent:0,ease:'power2.out',
  scrollTrigger:{trigger:'.head',start:'top bottom',end:'top 25%',scrub:0.3}});
gsap.fromTo('#solid-word',{xPercent:42},{xPercent:0,ease:'power2.out',
  scrollTrigger:{trigger:'.head',start:'top bottom',end:'top 25%',scrub:0.6}});

window.addEventListener('load',()=>ScrollTrigger.refresh());
</script>
```

One-shot timed tweens (`scrollTrigger:{trigger,start:'top 85%'}`, no scrub) are reserved for
curtains, badge/arc pops, and slide-ins. Anchors scroll via `lenis.scrollTo(el,{offset:-65})`;
popups call `lenis.stop()/start()`.

### 2b. EDITORIAL — native scroll + one-shot class toggles + CSS transition grammar

No libraries. Motion lives in CSS; JS only adds classes once and drives fixed-stage furniture
with a lightly-lerped rAF loop. The whole engine is ~120 lines.

```css
/* the universal reveal grammar — lines rise 1.4s out-expo, leave .3s in-quad */
.rl{display:block;overflow:hidden}
.rl>span{display:block;transform:translateY(112%);transition:transform 1.4s var(--out-expo)}
.in .rl>span{transform:translateY(0)}
.rf{opacity:0;transition:opacity .6s var(--out-sine)}     /* italic words fade — the ONE exception */
.in .rf{opacity:1}
.out .rl>span{transform:translateY(-112%);transition:transform .3s var(--in-quad)}
```
Stagger = inline `style="transition-delay:.08s"` per line (steps of .06–.08s, up to ~.32s).

```js
var vh=innerHeight; addEventListener('resize',()=>vh=innerHeight);
/* one-shot: elements leave the watch list the moment they fire */
var revealEls=[...document.querySelectorAll('[data-reveal]')];
function checkReveals(){
  revealEls=revealEls.filter(el=>{
    var r=el.getBoundingClientRect();
    if(r.top<vh*0.82&&r.bottom>0){el.classList.add('in');return false;}
    return true;
  });
}
/* scrub-for-furniture: native scroll + light lerp (~0.15–0.25) for silk */
var sY=0,sYs=0,lastTick=0;
function update(){
  var p=Math.min(Math.max(sYs/vh,0),1);           /* hero progress 0..1 */
  wordmark.style.transform='translate(-50%,'+((0.394*vh)*(1-p)+24.5*p)+'px) scale('+(1-0.648*p)+')';
  heroMedia.style.transform='scale('+(1-0.3*Math.max(0,p-0.1))+')';
  document.body.classList.toggle('theme-plain',sY>vh*0.92);   /* header theme swap */
  /* …per-pin math: q = clamp(-pin.top/(pin.height-vh),0,1) drives sticky-stage states… */
  checkReveals();
}
(function raf(){
  lastTick=performance.now(); sY=scrollY; sYs+=(sY-sYs)*0.2;
  if(Math.abs(sY-sYs)<0.1)sYs=sY;
  update(); requestAnimationFrame(raf);
})();
/* robustness: occluded/throttled tabs still update */
addEventListener('scroll',()=>{if(performance.now()-lastTick>200){sY=scrollY;sYs=sY;update();}},{passive:true});
setInterval(()=>{if(performance.now()-lastTick>300&&scrollY!==sY){sY=scrollY;sYs=sY;update();}},250);
```

Sticky pins are plain CSS (`.pin{height:300vh}` wrapping `.stage{position:sticky;top:0;
height:100vh;overflow:hidden}`); JS reads pin progress and toggles `.in`/`.out` state pairs
(A-leaves-up + B-enters-below sharing one slot) or writes clip-path/transform directly
(eased in JS: `1-Math.pow(1-k,3)` for slide-overs).

### 2c. REPORT — IO variant machine + counters + pure-CSS sticky curtain stack

No libraries. Three motion classes only: one-shot entrances on ONE house bezier, 1.0s
count-ups, and one lerped scroll-follow image. Everything else is still.

```css
:root{--bez:cubic-bezier(.44,0,.37,1)}   /* the single house voice, 0.3–0.5s band */
.mask{overflow:hidden;height:4.5vw}
.mask>span{display:block;transform:translateY(112%);transition:transform .5s var(--bez)}
.mask.m2>span{transition-delay:.1s}                  /* sibling stagger ≈ .1s */
.slide.in .mask>span{transform:translateY(0)}

/* curtain under-stack: NO JS. First slide relative; each later slide sticky inside a
   taller wrapper with DESCENDING z-index. The current slide scrolls up and off,
   revealing the next already pinned bone-still beneath. No fade, no scale, no parallax. */
.slides{position:relative;height:calc(300vh + 500px)}      /* n slides + dwell (~250px each) */
.slide{height:100vh;position:relative;overflow:hidden}
.s1{position:relative;z-index:4}
.sw{position:absolute;top:0;left:0;right:0}
.sw2{height:calc(200vh + 250px);z-index:3}
.sw3{height:100%;z-index:2}
.sw .slide{position:sticky;top:0}
```

```js
/* performed counter: 0→N in exactly 1s, once, affix as separate span (see §3) */
function runCount(el){
  if(el.dataset.done)return; el.dataset.done="1";
  var target=+el.dataset.target,t0=null;
  if(reduced){el.textContent=target;return;}
  (function tick(ts){ if(t0===null)t0=ts;
    var p=Math.min((ts-(t0||ts))/1000,1);
    el.textContent=Math.round(p*target);
    if(p<1)requestAnimationFrame(tick);
  })(performance.now());
  setTimeout(function(){el.textContent=target},1150);   /* occluded-tab safety: land it anyway */
}
var io=new IntersectionObserver(function(es){es.forEach(function(en){
  if(en.isIntersecting){runCount(en.target);io.unobserve(en.target);}})},{threshold:.6});
document.querySelectorAll('.cnt').forEach(function(el){io.observe(el)});

/* variant machine: curtain-aware one-shot reveals + nav dock + lerped photo follow */
function update(snap){
  var y=scrollY,vh=innerHeight;
  navFixed.classList.toggle('docked',y>hero.offsetTop+hero.offsetHeight-56);
  ptgt=Math.max(0,Math.min(1,(y-preface.offsetTop)/400));      /* scrub target */
  if(snap||reduced){pcur=ptgt;applyPhoto();}
  if(s1.getBoundingClientRect().top<vh*0.6)s1.classList.add('in');
  if(s1.getBoundingClientRect().bottom<vh*0.6)s2.classList.add('in');   /* underslide waits for */
  if(s2.getBoundingClientRect().bottom<vh*0.6)s3.classList.add('in');   /* its curtain to leave */
}
function loop(){pcur+=(ptgt-pcur)*0.15;applyPhoto();requestAnimationFrame(loop);}
addEventListener('scroll',function(){update(document.hidden)},{passive:true}); update(true);
```

---

## 3. Shared component patterns

### Mask-rise text splitter (BRUTALIST/JS poles; EDITORIAL pre-splits lines in HTML)
```js
/* chars: <span class=mask><span class=ch>X</span></span>, whitespace kept as text nodes */
function splitChars(el){
  const chars=[];
  const nodes=[...el.childNodes]; el.textContent='';
  nodes.forEach(n=>{
    if(n.nodeType===3){ for(const ch of n.textContent){
      if(/\s/.test(ch)){el.appendChild(document.createTextNode(ch));continue;}
      const m=document.createElement('span');m.className='mask';
      const c=document.createElement('span');c.className='ch';c.textContent=ch;
      m.appendChild(c);el.appendChild(m);chars.push(c);
    }} else { el.appendChild(n); if(n.nodeType===1)chars.push(...splitChars(n)); }
  });
  return chars;
}
```
```css
.mask{display:inline-block;overflow:hidden;vertical-align:bottom}
.mask .ch{display:inline-block;transform:translateY(102%)}
```
Word variant: split on `/(\s+)/`, wrap tokens the same way. "Loose" variant for
decoder/scramble: bare `.ch{opacity:0}` spans, animate opacity with
`stagger:{each:0.05,from:'random'}` — no masks. EDITORIAL pole instead hard-codes each line
as `<span class="rl"><span style="transition-delay:.08s">…</span></span>` (exact line breaks
are part of the composition; never let the browser rewrap a revealed line).

### Hover roll-swap (duplicated label)
```html
<a class="rollhost"><span class="roll"><span class="roll-in">
  <span>Label</span><span aria-hidden="true">Label</span>
</span></span></a>
```
```css
.roll{display:block;overflow:hidden;height:18px;line-height:18px}
.roll .roll-in{display:block;transition:transform .35s var(--bez)}   /* EDITORIAL: .5s out-expo */
.roll .roll-in span{display:block;height:18px}
.rollhost:hover .roll .roll-in{transform:translateY(-18px)}
```
BRUTALIST index-flip variant: `.idx` flips out up (`translateY(-100%)`, opacity 0, .2s) while
an absolutely-positioned `.hword` rises from `translateY(100%)` — two different words, one slot.

### Hover wipe-twin (REPORT — one mechanism, many colorways)
```css
.wipe{position:relative;overflow:hidden}
.wipe::before{content:"";position:absolute;inset:0;background:var(--wipe,var(--blk));
  transform:translateX(-101%);transition:transform .38s var(--bez);z-index:0}
.wipe:hover::before{transform:translateX(0)}
.wipe>*{position:relative;z-index:1}
/* per surface: --wipe:var(--orange); pair with transition:color .25s on the host */
```

### Underline draw
```css
/* transform flavor (BRUTALIST, .25–.35s) */
.ulink{position:relative}
.ulink::after{content:"";position:absolute;left:0;bottom:-2px;height:1px;width:100%;
  background:currentColor;transform:scaleX(0);transform-origin:left center;
  transition:transform .3s ease-out}
.ulink:hover::after{transform:scaleX(1)}
/* background-size flavor (EDITORIAL — exits sliding out right, .6s (.55,0,.1,1) +.1s delay) */
.cta-line{background-image:linear-gradient(currentColor,currentColor);background-repeat:no-repeat;
  background-size:0% 1px;background-position:left 100%;
  transition:background-size .6s cubic-bezier(.55,0,.1,1) .1s;padding-bottom:3px}
.cta-line:hover{background-size:100% 1px}
```

### Curtain multi-panel wipe (identity titles — BRUTALIST)
```html
<div class="title-wrap"><h2 class="title" style="transform:scaleX(1.1);opacity:0;
  transform-origin:left center">…</h2>
  <div class="curtains"><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
```
```css
.curtains{position:absolute;inset:0;display:flex;z-index:2;pointer-events:none}
.curtains i{flex:1;background:var(--ground);transform-origin:left center}
```
```js
const tl=gsap.timeline({scrollTrigger:{trigger:wrap,start:'top 80%'}});
tl.to('.curtains i',{scaleX:0,duration:1.2,ease:'power1.inOut',stagger:0.05},0.3)
  .to('.title',{scaleX:1,opacity:1,duration:1.2,ease:'power1.inOut'},0.3);
```

### Aperture clip-path reveal (EDITORIAL — media opens, never fades)
Small window → full, .7–1.4s in-out-quint `cubic-bezier(.83,0,.17,1)`. Three validated scales:
loader type-hole (`width/height 0 → 15.6vw → FLIP to 100vw/100vh`), sticky-stepper wipe
(scroll-driven: `clipPath='inset(iy% ix% iy% ix%)'` where ix,iy shrink from a 26.5vw centered
window to 0 over the first 30% of pin progress), and grid pair:
```css
.mp{clip-path:polygon(20% 20%,80% 20%,80% 80%,20% 80%);transition:clip-path 1.1s var(--out-expo)}
.in .mp{clip-path:polygon(0% 0%,100% 0%,100% 100%,0% 100%)}
```

### Marquee (measured px/s — duration derives from content width)
```html
<div class="mq"><div class="mq-track" id="mq"><span>ITEM — ITEM — …&nbsp;</span></div></div>
```
```css
.mq{overflow:hidden;white-space:nowrap}
.mq-track{display:inline-block;will-change:transform;animation:mq linear infinite}
@keyframes mq{to{transform:translateX(-50%)}}
```
```js
const track=document.getElementById('mq');
track.innerHTML+=track.innerHTML;                       /* duplicate once for the seamless loop */
const half=track.scrollWidth/2, SPEED=80;               /* px/s — measure the original; 60–120 typical */
track.style.animationDuration=(half/SPEED)+'s';
```
Ambient loops obey axis A10: constant linear speed, no ease, and none at all on the REPORT pole.

### Performed counter with affix span (REPORT)
```html
<div class="stat-num"><span class="cnt" data-target="850">0</span><span class="affix">+</span></div>
<p class="stat-cap">Designers surveyed across 50+ countries.</p>
```
`runCount` from §2c: exactly 1.0s, linear-ish, one-shot (`data-done` guard), fired by IO at
`threshold:.6` or by the section's own entrance (e.g. 650ms after its card docks). The affix
never counts; magnitude at display scale (4.98–7.03vw, weight 500) above a small fixed-measure
caption. `+setTimeout(target,1150)` so occluded tabs still land the number.

### Loader with progress binding + hold-and-release
Progress UI must move in **eased jumps with a hold before release** (a linear fake was scored
against). Bind to real asset progress when assets exist; else simulate:
```js
var jumps=[0.18,0.34,0.55,0.71,0.86,1], ji=0;
function nextJump(){
  if(ji>=jumps.length){setTimeout(release,420);return;}       /* hold-at-full, then release */
  var tp=jumps[ji++];
  bar.style.transform='scaleX('+tp+')';        /* bar: scaleX from transform-origin:left */
  pct.textContent=Math.round(tp*100)+'%';      /* pct label travels with the bar tip */
  setTimeout(nextJump,220+Math.random()*300);
}
setTimeout(nextJump,1300);
```
`release()` converts the loading UI itself into the hero reveal — never a plain fade:
BRUTALIST letterbox (loader = top/bottom black panels + 24px bar strip; panels part
`yPercent:±100` 1.2s power1.inOut while the hero's `clip-path:inset(75vh 0 calc(25vh−24px) 0)`
opens to `inset(0)` over 1.2s brand ease, then the wordmark stamps in char-by-char, stagger
0.15); EDITORIAL FLIP (read the type-hole's rect, pin it `position:fixed` at that rect, then
transition left/top/width/height to `0,0,100vw,100vh` in .7s in-out-quint while loader lines
exit ±60vh). REPORT variant is a time-choreographed scroll-locked intro
(`html.lock{overflow:hidden}` + setTimeout phase classes at 1100/2350/3250/3700ms + a 6s
failsafe that always calls `settle()`).

---

## 4. Fonts

- One `css2` link, two families max, only the weights/styles actually used, `display=swap`:
  - EDITORIAL: `Cormorant:ital,wght@0,400;1,400` + `Inter:wght@400;500`
  - REPORT: `Archivo:wght@400;500;700` + `Geist+Mono:wght@400;500`
  - BRUTALIST clone shipped with NO webfont — pure system stacks (see below) still scored 8.3.
- **The asset-risk rule (recurring loss pattern):** the flagship face must genuinely carry its
  needed cut — ultra-black 800–900 (BRUTALIST), a TRUE italic (EDITORIAL), a true 500
  (REPORT). A merely-bold or faux-italic fallback was the largest single deduction in cycle 1.
  Verify after load (render two samples and compare, or `document.fonts.check('500 16px Archivo')`)
  and always name a guaranteed stand-in in the stack.
- Validated fallback stacks (copy verbatim):
```css
/* BRUTALIST */
--grot:"Helvetica Neue",Helvetica,Arial,sans-serif;
--display:"Arial Black","Archivo Black","Helvetica Neue",Arial,sans-serif;   /* the 900 slab */
--didone:"Didot","Bodoni MT","Playfair Display",Georgia,serif;               /* light italic */
--mono:ui-monospace,"SF Mono","DejaVu Sans Mono",Menlo,Consolas,monospace;
/* EDITORIAL */
--serif:"Cormorant",Georgia,"Times New Roman",Garamond,Palatino,"Book Antiqua",serif;
--sans:"Inter",Roboto,"Helvetica Neue",Arial,sans-serif;
/* REPORT */
--sans:"Archivo","Helvetica Neue",Arial,sans-serif;      /* never a geometric Poppins-like */
--mono:"Geist Mono","SFMono-Regular",Menlo,monospace;
```

---

## 5. Placeholder media (this technique preserved color/mood scores at 8–9.5)

Every media slot = a CSS-gradient stand-in matched to the slot's mood spec, **value key first**:
decide light-valued vs dark-valued ground BEFORE hue — same hues at inverted value read as the
opposite emotional register (cycle 3's biggest deduction).

```css
/* anatomy: layered radial highlights over a linear base, + grain, + tiny label */
.media{position:relative;overflow:hidden;background:#c9c4bf}
.m-amber{background:
  radial-gradient(120% 90% at 72% 30%, rgba(255,214,160,.5), rgba(0,0,0,0) 55%),
  radial-gradient(140% 120% at 50% 110%, rgba(40,16,4,.55), rgba(0,0,0,0) 60%),
  linear-gradient(158deg,#b4642a 0%,#d98a3a 44%,#8a4718 100%)}  /* warm amber film, mid-dark */
/* SVG turbulence grain overlay — accepted equivalent of in-asset grain */
.media::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;
  mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/><feColorMatrix type='saturate' values='0'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='0.3'/></svg>")}
/* the label documents what real media goes here (mono, ~9-10px, low-alpha, bottom-left) */
.media .ml{position:absolute;left:12px;bottom:10px;z-index:2;font-family:var(--mono);
  font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(248,248,248,.55)}
```
```html
<div class="media m-amber"><span class="ml">film — bride &amp; hanging gown · amber loop</span></div>
```

- Build a small mood library per page (4–8 recipes: `m-amber`, `m-grey`, `m-bw`, `m-warm`…)
  and reuse; gallery tiles can be flat 2-stop gradients (`.ph-1…ph-8` style).
- "Video" slots get slow life: `background-size:130% 130%` + 12s alternate background-position
  pan, or an oversized `.drift` layer of stacked radial-gradients on a 38–46s
  `translate/scale` alternate loop (REPORT montage). ≥10s periods — placeholder video breathes,
  it does not animate.
- Gradient energy lives ONLY in the media layer; the designer's own surfaces stay flat (A14).
- Label prefix states the medium: `[ video: … ]` / `film — …` / `scan — …` / `3D — …`.

---

## 6. Verification checklist (what the evaluators actually checked)

Before declaring done, load the page in a real browser (claude-in-chrome or Playwright) and:

1. **Full slow scroll, top to bottom.** Every section renders; every reveal fires; nothing
   stays hidden because its trigger never intersected (watch for `overflow:hidden` ancestors
   killing IO, and sticky underslides revealing before their curtain has left).
2. **Counts exact.** Tiles, list rows, dots, chips, roster names, chapter counts, per-chapter
   list items — match the visual script exactly; a repeated roster carries the SAME names in
   the SAME split on every surface (nav, carousel, footer).
3. **Console clean.** Zero errors at load, after the intro, and after a full scroll (CDN 404s,
   null lookups from renamed ids, GSAP "target not found" warnings all count).
4. **One-shots fire once.** Scroll up and back down: entrances must NOT replay (one-shot lists
   drained / `io.unobserve` / `data-done` guards). Counters land on their exact target.
5. **No accidental bounce.** No spring/overshoot ease anywhere unless the script names one;
   audit every `ease:` and `transition:` against the pole's named voices (A5).
6. **Negative space respected.** The sections the script marks "no animation" (galleries,
   partner walls, list rows, hairlines) are genuinely still — animating them is a fidelity
   BUG, not polish.
7. **Loader/intro completes and unlocks.** Scroll lock always releases (failsafe timeout);
   the loader element is removed from the DOM after release; a cached revisit path (or
   `?jump=N`) skips it cleanly.
8. **Hovers.** Every interactive surface answers with the site's ONE swap grammar; no press/
   click animations; wipe-twins pre-render (no layout shift on first hover).
9. **No horizontal scrollbar** (`overflow-x:clip` holding) while the scripted bleeds still
   bleed; check at 1440×900 and one other width.
10. **Reduced-motion:** with `prefers-reduced-motion`, the page is fully readable at end state
    (intro skipped, counters snapped, transitions off) — read the frames, not just the counts:
    a generated object must still be painted (§8).
11. **Two-pass walk.** A 1.1s-settle walk AND a 2.5s-settle walk, every frame of both read.
    Anything not complete at 1.2s after its room enters is a defect (arrival budget, B5), not
    a walker artefact; anything different between the passes is a timing you have not seen.
12. **Timed hero capture** at 0/200/500/900/1400/2400ms after load. t0→t500 must not show the
    finished state, then blank, then re-entry (the pre-hydration flash, B6); t200 must show the
    ground furniture, not empty paper.
13. **Flipbooks over every pin and scrub** (100–150px steps, ~120ms waits): every rest position
    shows a whole, still item; no sheet cropped at a viewport edge; no prose mid-reveal in the
    lower viewport (B3, B4).
14. **Hover capture** (`page.hover` + screenshot on one contents link, one CTA, one hot ask):
    the walk scripts cannot see the hover grammar at all.
15. **Header per room**: capture the collar across every room boundary; the readout and the
    ground swap must change at each (B4).
16. **Phone frames** (390×844) read, not just `scrollWidth − clientWidth`: a wrapped counter
    row with an orphaned figure passes the overflow check and fails the jury (B7).
17. **Record a visitor.** `recordVideo` at 1440×900 → GIF (12–15fps): a fresh load with 4s
    of nothing, then wheel-scrolled (real wheel events, ~120px/60ms, 1.5–2s pauses at every
    room), a hover pass, a phone pass. Step through the frames — hand-off pops, reversed
    leave choreographies, counts performing off-screen and readouts that never change are
    all invisible to stills at rest.
18. **Score awardFeel and brandFidelity** beside the eight dimensions. A page can score 8 on
    every craft dimension and 4 on awardFeel — the document failure mode (B11).


---

## 7. Applying the skill to an existing framework page (first real use, 2026-09-08)

The playbook above assumes a standalone single-file page. The first real use was the
opposite: a Next.js marketing route with its own design world (tokens, faces, a colour
budget, a house motion rule). What carried over unchanged: the visual script first, the
type ladder with monumental ends, one entrance verb, restraint zones, the arc with a
belief room, a climax and a bookend, performed numbers, the reacting header. What changes:

- **The deliverable is the page's own components**, not an HTML file. Keep the script
  beside them (`VISUAL-SCRIPT.md` in the component folder) and write the register's
  brand-forced deviations as a table (axis | pole says | this page does | why) at the top —
  see `visual-script.md` §2b.
- **Reuse the world's motion metaphor as the entrance verb** when it has one. A "surveyed
  in left to right" world gets a horizontal clip wipe (`clip-path: inset(0 100% 0 0) → 0`),
  which still satisfies S2 (arrives through a clip, never fades) without importing a
  vertical mask-rise the world never spoke.
- **Ship the finished state; arm the hidden pre-state only when JS ran, motion is allowed
  and the element is below the fold.** No JS, reduced motion, already on screen: the page
  is simply printed. This is what keeps e2e tests, SEO snapshots and calm visitors whole.
- **Perform only measured numbers.** Where a page mixes real and illustrative figures,
  counting up only the real ones turns provenance into motion (observed-once; it read as a
  craft signal rather than a gimmick).

Two mechanics that bit, both silent:

1. **A clip-path'd target has zero intersection area.** Chrome reports
   `intersectionRatio: 0` for an element whose `clip-path` is `inset(0 100% 0 0)`, so an
   IntersectionObserver with `threshold: 0.12` never fires and every below-fold reveal
   stays blank — and the page looks fine above the fold. Observe with `threshold: 0` and
   `entry.isIntersecting`; keep `rootMargin: "0px 0px -10% 0px"` as the edge guard.
   (Opacity pre-states do not have this problem, which is why it surfaces exactly when a
   fade is upgraded to a clip.)
2. **Oversized hollow type has phantom height.** A 24vw wordmark at `line-height: .76`
   has a glyph content box ~90px taller than its line box, and a content box counts as
   scrollable overflow even where the ink does not — a blank strip appears under the
   footer. `overflow-y: clip; overflow-x: visible` (the one mixed pair CSS allows) keeps
   the right-edge bleed and drops the strip.

And one hygiene item: **measure the face before claiming a bleed.** The script assumed
~0.55em per glyph and listed the cover's third line as a deliberate overflow; Archivo sets
it at ~0.47em and the line fit with 200px to spare, while the condensed footer face needed
24vw, not 16.4vw, to leave the viewport. Render once (or `canvas.measureText`) and put the
measured widths in the arithmetic audit.

### Verification without Claude-in-Chrome

When the browser extension is not connected, a Playwright walk does the slow-scroll pass:

```js
// walk.mjs — run from the project so @playwright/test resolves
import { chromium } from "@playwright/test";
const [,, url, outdir, w = "1440", h = "900"] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errors = []; p.on("console", m => m.type() === "error" && errors.push(m.text())); p.on("pageerror", e => errors.push(String(e)));
await p.goto(url, { waitUntil: "networkidle" }); await p.waitForTimeout(2500);
const sc = () => document.querySelector("[data-scroll-root]") ?? document.scrollingElement;   // the element that scrolls
const total = await p.evaluate(sc.toString() ? `(${sc})().scrollHeight` : "0");
for (let y = 0, i = 0; y < total; y += +h, i++) {
  await p.evaluate(`(${sc})().scrollTop = ${y}`); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${outdir}/v${String(i).padStart(2, "0")}.png` });
}
const pending = await p.evaluate(() => document.querySelectorAll("[data-armed]:not([data-in])").length);
console.log(JSON.stringify({ total, pending, errors })); await b.close();
```

Read every frame, not just the hero; report `pending` (reveals that never fired) and
`errors` as gate failures. Add a reduced-motion context (`reducedMotion: "reduce"`) that
asserts nothing is armed and performed numbers are printed at their targets, and a phone
viewport that asserts `scrollWidth - clientWidth <= 1`.


---

## 8. Second real use — a brand build with stages, three takes juried (2026-09-12)

The first real use (§7) kept the REPORT engine and shipped a page that scored well on craft
and read as a document. Three takes on the same world, each borrowing one mechanism from
another pole, were juried on award feel and brand fidelity; `design-principles.md` Part IV
holds the rules, this section holds the mechanics that carried. All three ran inside a
Next.js app whose scroll container is **not the window** (`html, body { overflow: hidden }`
with an `overflow-y: auto` main): `window.scrollY` is always 0, scroll listeners, progress
maths and IO roots use the scroll root, `position: sticky` works inside it, and the root gets
`overflow-x: clip` for the rationed bleeds.

### 8a. The boot state (required on any hydrated page — B6)

`useLayoutEffect` arming runs 300–700ms after SSR painted the finished hero; the reader sees the
end state, then a blank, then the entrance. The fix is set from the HTML before React exists:

```html
<!-- in the route's server component, before the landing markup -->
<script dangerouslySetInnerHTML={{ __html: `
  (function(){var d=document.documentElement;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    d.setAttribute('data-boot','');
    setTimeout(function(){d.removeAttribute('data-boot')},4000);})();` }} />
```
```css
/* pre-states keyed to the boot attribute — only ABOVE the fold; below-fold arming stays the §7 pattern */
html[data-boot] .hero .line   { clip-path: inset(0 100% 0 0) }
html[data-boot] .hero .cnt    { visibility: hidden }        /* numbers never visible at target before they perform */
html[data-boot] .hero .map    { animation: survey-in 1200ms var(--ease) both }  /* the object can start from CSS, before hydration */
/* what the boot state SHOWS: collar, neatline ticks, eyebrow — never empty ground for >300ms */
```
The engine removes `data-boot` when it mounts and takes the clock from there (marks are
hydration-relative; declare the expected load→hydration offset). The 4s failsafe removes it
regardless. Reduced motion never sets it, so the calm page is simply printed.

### 8b. The hero pin — born wordmark, dock, drawn route (EDITORIAL engine; won both lenses)

```
<section class="pin" style="height:300vh">            // the pin
  <div class="stage" style="position:sticky;top:0;height:100vh;overflow:hidden">
    <svg class="map" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">…contours, stations, <path class="route" pathLength="1000">…</svg>
    <div class="twin">Job AI Hub</div>              // born at 223px, docks into the collar
    <h1><span class="line">…</span>…</h1> lede, controls
  </div>
</section>
```
```js
// one lerp on scrollTop; everything in the pin reads `y`
let y=0, ys=0; const root=document.querySelector('[data-scroll-root]');
function frame(){ y=root.scrollTop; ys+=(y-ys)*0.18; if(Math.abs(y-ys)<0.1)ys=y;
  const q=Math.min(Math.max(ys/396,0),1);                       // dock over the first 396px
  const b=bornRect, c=collarRect;                               // measured once (fonts.ready), re-measured on resize
  twin.style.transform=`translate(${(c.left-b.left)*q}px,${(c.top-b.top)*q}px) scale(${1-(1-c.height/b.height)*q})`;
  if(q===1) handOff();                                           // twin hidden, collar's own name shown — within 1px
  const d=Math.min(Math.max((ys-216)/1188,0),1);                // route drawn 216→1404px
  route.style.strokeDashoffset=1000*(1-d);
  stations.forEach((s,i)=>s.toggleAttribute('data-in', d>=s.at)); // labels wipe in as the pen reaches them
  requestAnimationFrame(frame);
}
```
Title lines, lede and controls fire as **timed one-shots** when their threshold is crossed
(600ms clip wipe, 80–100ms stagger) — never scrub-bound (B3). Dwell ≥ 400px before release.
Check the dock path against every fixed element it crosses; bring the eyebrow in after the
hand-off if the path runs over it. Station labels are SVG `<text>` (clip-path works on SVG
text too; HTML labels cannot follow an `xMidYMid slice` map at other viewports) — set
`text-rendering: geometricPrecision` and caps in the source to keep Chromium's tracking even.

### 8c. Chapters as a curtain under-stack beneath a sticky collar (REPORT A7, brand build)

Pure CSS as in §2c, with two adjustments the takes needed: slides pin at
`top: var(--collar-h)` inside `height: calc(100vh - var(--collar-h))`, and the collar's
readout / ground swap is driven from `scrollTop` against **measured room tops** in the same
rAF loop — never from an IntersectionObserver on the sticky slides (dead). Each slide is one
exhibit at exhibit scale, flat on the ground, no panel: a full-width board on a ~300px well,
a horizontal log through stations, an A4 sheet on rock (value contrast against the next
slide's ground), a ruled rubric with two empty trailing rows. Fill the slide or declare the
silence; never leave 200px of ground under a short exhibit (B4, B5).

### 8d. A generated object in the world's material (contour field)

```
value noise (3 octaves) → gain ×2 about the midline → marching squares at 6px cells
  → polylines; the normalised octaves span ~[0.3, 0.7], so choose contour spacing AFTER the gain.
```
- **Build-time for the SVG map** (a TS constant of polylines; the no-JS page keeps the object).
- **Canvas for a living plate or a terrain-cut wordmark**: DPR ≤ 2, ≤ 30fps, restrict the
  dense pass to the glyphs' bounding box, pause when off-screen or `document.hidden`,
  `document.fonts.load()` before `strokeText`/`fillText` (a system-font name otherwise flashes
  in the plate), and read the family from the CSS variable next/font resolved.
- **Perceptibility** (B9): the drift moves ≥ one line-spacing within ~4s somewhere in the
  frame, or a dense hatched region does the moving, or drop the claim.
- **Reduced motion / no JS**: paint one finished frame synchronously (canvas) or fall back to
  a hatched fill with the same marks — verify by reading the reduced-motion frame.

### 8e. Small mechanics that bit

- **Masks under line-height < 1** clip descenders: `padding: .12em 0 .22em; margin: -.12em 0
  -.22em` on the mask, park the line at 140% (B7).
- **Hard-coded line masks** are `white-space: nowrap` with a measured width; a mask that
  re-wraps produces orphans.
- **Row-triggered counters under React**: child layout effects run before the parent's
  arming, so a counter inside a revealed row watches its row's `data-in` with a
  MutationObserver (start = row delay + 300ms) — and the whole sequence still lands ≤ 1.2s.
- **A hover-completed ask** in the clip grammar: the answer word is parked in the same slot
  and wipes/rises in on hover of the whole line; statement step; no accent when the colour
  budget is spent (B8).
- **Timed intros need no JS timeline**: every mount-armed element carries its mark as a CSS
  `transition-delay`; only the object's focus and the counters keep timers.
- **The walker can be poisoned by a dev-server HMR reload** mid-walk (61 "pending" with the
  hero at scroll 9000+): run captures one at a time and re-run on a clean load.
- **A dock's last frame must carry k = 1.** Writing the twin's transform only while
  `k < 1` hides a twin drawn at k ≈ 0.96 and shows the docked name — a 4px/2px pop that no
  still catches and every recording does. Write the transform every frame, including the
  docking one.
- **Leave is its own choreography.** A CSS transition reads its timing from the state it
  enters, so base rules are the *leave* (the answer retreats, then the question returns
  with a delay) and `:hover` rules are the *enter*; and both words must hold an `inset()` at
  rest — `inset()` → `none` is not interpolable and snaps.
- **"In view" needs an edge.** A performed number whose top 4px are inside the viewport is
  not being read; gate the count on the figure being ≥ 80px inside (`rootMargin: 0 0 -80px`),
  not on its room's top having entered.
- **A short last room never reaches the collar.** At scroll end the last room is current,
  or the readout never names the colophon.
- **The calm page still has a collar.** The readout and the ground swap are text and a
  class, not motion; run them from the scroll event when the engine stands down.
- **What the hand draws lives in the type's grid, never under it.** A route drawn on a
  full-bleed `slice`-scaled object while the title is bottom-anchored and sized in `vw`
  cannot be kept apart from the type: the two scale by different rules, and the owner's
  first remark on the grafted page was the title sitting on the journey. Put the drawn
  thing in a grid area the type leaves free (right of the short lines, above the long one;
  a row above the title below 1024px), in a box whose coordinates are fractions, and let
  CSS keep them apart at every size. Verify with a rect/point probe across ≥ 5 viewports
  (text client rects via `Range.getClientRects()`, the path sampled with
  `getPointAtLength` × `getScreenCTM()`), not with one screenshot.
- **A clip, not a dashoffset, for a route in a non-uniform box.** In a box with
  `preserveAspectRatio="none"` a `pathLength` dash no longer tracks screen length; if the
  route's x only increases (vertical-tangent S-curves between stops do this, and keep a
  label set right of its square clear of the line), a left→right `clip-path` reveals exactly
  the path drawn so far — the entrance verb again. At r = 0 close the clip completely: a
  negative inset meant to spare the stroke's width prints half of a vertical first segment.
- **Nothing of the object while the wordmark passes over it.** Start the drawn journey the
  instant the dock completes, first square included; on a phone the twin rises up the same
  left edge the journey row starts on. The six defects above were invisible to stills and probes
  and obvious in a 12fps GIF of a visitor scrolling; a recorded usage pass (video → GIF,
  100ms stills of the first 4s) belongs in the verification checklist before hand-off.

### 8f. Verification tools (Playwright, no extension needed)

Five scripts, run from anywhere, resolving `@playwright/test` from the app checkout: a
two-settle **walk** (prints `{total, frames, pending, errors}`), **seq** (frames at ms marks
after load), **motion** (flipbook between two offsets), **checks** (phone overflow,
reduced-motion armed count + frame, no-JS text) and **hover**. Reference copies live in the
design-extraction lab at `worlds/expedition/r2/tools/`; the shape of each is the §7 walk
script with a `ROOT` expression that finds the scroll container:

```js
const ROOT = `(document.querySelector("[data-scroll-root]") || document.scrollingElement)`;
await p.evaluate(`${ROOT}.scrollTop = ${y}`);
```
