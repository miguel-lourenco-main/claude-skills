---
source: https://lovable.dev/guides/scrolling-designs-patterns-when-to-use
title: "Scrolling Designs: 8 Patterns and When to Use Each"
topic: scroll interaction patterns — selection and accessibility
value: 5
keep: yes
---
## Use when
Choosing a scroll interaction pattern (parallax, infinite scroll, horizontal scroll, scrollytelling, snap scroll, fixed background, scroll-triggered reveal, multi-directional scroll) for a given content type, and knowing its accessibility obligations.

## Rules
- Match the pattern to content type + user intent first, technical complexity second:
  - Discovery-focused, homogeneous streams (social feeds, news) → infinite scroll.
  - Goal-directed tasks (ecommerce search/comparison, documentation) → pagination or "Load More" — never infinite scroll, because users need to compare items, return to a specific position, bookmark/share a URL, and reach footer information, all of which infinite scroll breaks (per Nielsen Norman Group and Baymard Institute research cited in guide).
  - Visual storytelling / narrative with chronology (nonprofit stories, investigative journalism, data narratives) → scrollytelling (scroll-scrubbed animation).
  - Section-based content the user should digest in discrete chunks (landing pages, product tours) → snap scrolling.
  - Gallery/visual browsing (portfolios, image carousels, timelines) → horizontal scrolling — not text-heavy content.
- "Load More" button can outperform both infinite scroll and full pagination: it keeps navigable/bookmarkable positions (like pagination) while still giving fast, low-friction content loading (like infinite scroll) — per Baymard Institute research cited in guide. The one tradeoff: it adds a click, so it fits goal-directed contexts better than pure discovery feeds.
- Avoid `background-attachment: fixed` for background-parallax effects — it fails entirely on iOS and causes scroll jank even on desktop (per CSS-Tricks analysis cited in guide). Use a `position: fixed` background element with scrollable `position: relative` content layered over it instead — same visual effect, reliable across browsers/devices.
- For scroll-triggered reveal animations, only animate GPU-accelerated properties (`transform`, `opacity`); other properties trigger layout recalculation and visible stutter (per web.dev's animation guidance, cited in guide). Prefer the native IntersectionObserver API over scroll-event listeners to avoid the performance cost of polling scroll position.
- Any animation triggered by scroll must respect `prefers-reduced-motion` — required for WCAG 2.1 compliance, and functionally necessary because motion (especially parallax) can harm users with vestibular disorders.
- Infinite scroll and multi-directional/2D scrolling both carry specific accessibility failure modes: infinite scroll loads content with no announcement to screen readers and users lose position context (per Deque's analysis, cited in guide); WCAG 2.1 requires content stay usable without 2D scrolling at 400% zoom, so multi-directional scroll needs a single-direction responsive fallback at that zoom level, not an exception.
- Horizontal scroll regions need explicit keyboard support beyond default browser behavior: custom arrow-key navigation plus a skip-navigation link so keyboard users can jump past the region (per Ryan Mulligan's analysis, cited in guide); any auto-scrolling content must be pausable (per W3C WAI Carousel Tutorial, cited in guide).
- CSS scroll-snap (`scroll-snap-type`, `scroll-snap-align`) needs no JavaScript for basic snap behavior and works across all major browsers — prefer it over JS-driven snap implementations for simple full-section layouts. Use "proximity" snapping instead of "mandatory" when content heights vary or when the content is long-form reading (mandatory snapping disrupts natural reading flow).
- On mobile, use passive event listeners for touch/wheel events to avoid scroll jank, and handle iOS's viewport-height quirk (iOS Safari sizes the viewport by max screen height, not the currently visible height minus browser chrome) via a JS-driven CSS custom property rather than raw `100vh`. Test scroll behavior on real devices — DevTools does not accurately simulate mobile viewport/touch behavior.

## Patterns (name — when to use — when to avoid)
- Parallax (multi-layer depth via 3D transforms/scroll-driven animation, not JS scroll listeners) — use for campaign microsites and desktop-primary storytelling where visual impact justifies the build cost; avoid on core transactional properties, mobile-first products, and anywhere SEO matters, and never ship without `prefers-reduced-motion` support.
- Infinite scroll — use for homogeneous discovery feeds; avoid for any task where users compare, bookmark, or need to return to a specific item.
- "Load More" button — use as a middle ground for goal-directed browsing that still benefits from fast incremental loading.
- Horizontal scroll — use for visual/gallery content on desktop-first builds with accessibility budget; avoid for text-heavy or mobile-primary content, or when accessibility resources are limited.
- Scrollytelling (scroll-scrubbed narrative animation) — use for long-form journalism, data stories, and step-by-step educational content; avoid for standard blog posts, time-sensitive news, or frequently-updated content (development cost too high relative to shelf life).
- Snap scrolling — use for full-page sections, galleries, mobile-first presentation layouts; use caution (or proximity snap) for long-form reading or content with highly variable section heights.
- Fixed-position background layering (not `background-attachment: fixed`) — use for subtle desktop depth effects; still needs `prefers-reduced-motion` support.
- Multi-directional (2D) scroll — reserve for genuine spatial-exploration value (portfolios, design showcases); mandatory single-direction fallback at 400% zoom is non-negotiable for WCAG compliance.

## Anti-patterns
- Infinite scroll on an ecommerce search/results page.
- `background-attachment: fixed` for any parallax-style effect.
- Any scroll-triggered animation shipped without a `prefers-reduced-motion` fallback.
- Horizontal or multi-directional scroll regions with no keyboard path (no arrow-key support, no skip link, no single-direction fallback at high zoom).
- Mandatory scroll-snap on long-form reading content.

## Checklist
- [ ] Pattern choice matches content type (discovery vs. goal-directed vs. narrative vs. visual gallery vs. section-based).
- [ ] `prefers-reduced-motion` respected for every scroll-triggered animation.
- [ ] Parallax/background effects use transform/fixed-element techniques, never `background-attachment: fixed`.
- [ ] Only `transform`/`opacity` animated on scroll-triggered reveals.
- [ ] Horizontal/2D scroll regions have keyboard nav, skip links, and (for 2D) a single-direction fallback at 400% zoom.
- [ ] Mobile touch/viewport quirks (passive listeners, iOS viewport height) handled explicitly.
- [ ] Tested on a real device, not only in DevTools emulation.
