---
source: https://lovable.dev/guides/responsive-web-design-techniques-that-work
title: Responsive Web Design Techniques That Work
topic: responsive layout, images, typography, testing
value: 4
keep: yes
---
## Use when
Building or reviewing a responsive layout — breakpoint strategy, image handling, fluid typography, and how to test across viewport sizes.

## Rules
- Design mobile-first: build the small-screen experience first, then progressively enhance for larger screens. The constraint of limited space forces prioritization of only essential elements; that same prioritized set tends to benefit desktop too. Mobile-first is also the technical reality now — Google completed mobile-first indexing Oct 31, 2023 (per Google, per guide), so the mobile version is what search ranking is based on.
- Prefer CSS Grid `auto-fit`/`minmax()` and Flexbox `flex-wrap` over manually written breakpoint rules for card/column grids. A single fluid-layout declaration (e.g., auto-fit + minmax) can replace multiple explicit breakpoint rules and removes an entire category of bugs where fixed breakpoints don't match real device widths.
- Use container queries, not only viewport/media queries, for components that must adapt to their placement context (e.g., a card that should lay out differently in a narrow sidebar vs. a wide content area) — a component keyed only to viewport width looks identical regardless of its actual available space. Container queries had 93.92% global browser support as of Dec 2025 (per guide) and are production-ready; supported from Chrome 106+, Safari 16+, Firefox 110+, Edge 106+.
- Serve responsive images via `srcset`/`<picture>` so the browser picks an appropriately sized asset — never ship one large image to all breakpoints. Prefer modern formats (WebP/AVIF) for large file-size reductions.
- Lazy-load only images below the initial viewport; never lazy-load the first/hero content image users see on load (delaying it hurts perceived load and LCP).
- Always set explicit width/height (or aspect-ratio) on images to reserve their layout space and prevent content "jumping" as they load (per Google's Core Web Vitals guidance, per guide).
- Build fluid typography with `clamp(min, preferred, max)`, where preferred uses a viewport-relative unit and min/max use `rem`. Using `rem` bounds (not raw `vw` values) matters for accessibility: viewport units alone don't respond to browser zoom, so unclamped vw-only sizing breaks zoom-based accessibility; rem-bounded clamp() still scales with user zoom/preferences.
- Test responsively in three complementary passes: (1) browser DevTools at defined breakpoints, (2) continuous drag-resize testing *between* breakpoints (most real users load at non-standard, in-between widths — resized windows, split-screen, etc.), (3) real-device testing for genuine touch/network/hardware behavior that emulators approximate. When drag-testing between breakpoints, specifically watch for: content overflow, awkward text-wrap at headline breakpoints, nav-item collision, and touch targets that shrink below usable size.

## Patterns (name — when to use — when to avoid)
- Container queries for shared components — use for any component reused across differently-sized parents (cards, sidebars, widgets); unnecessary for one-off, single-context layouts where viewport queries already suffice.
- clamp()-based fluid type/spacing — use for headings and body text that need to scale smoothly across a wide viewport range; less useful for fixed-size UI chrome (icons, buttons) where a few fixed breakpoint sizes are simpler.

## Anti-patterns
- Writing many discrete pixel-breakpoint rules for a grid that Grid's `auto-fit`/`minmax()` could express in one declaration.
- Using `background-attachment: fixed` or raw `vw` units for text sizing without `rem` bounds (breaks zoom accessibility).
- Lazy-loading the hero/first-viewport image.
- Testing only at named breakpoints and skipping the in-between drag-resize pass.

## Checklist
- [ ] Layout built mobile-first, then enhanced upward.
- [ ] Grid/Flexbox auto-sizing used before hand-written breakpoint rules.
- [ ] Shared components use container queries where their layout must adapt to placement, not just viewport width.
- [ ] Images use srcset/picture, modern formats, explicit dimensions, and lazy-load only below-the-fold.
- [ ] Typography uses clamp() with rem-based min/max bounds.
- [ ] Tested at breakpoints, between breakpoints (drag-resize), and on at least one real device.
