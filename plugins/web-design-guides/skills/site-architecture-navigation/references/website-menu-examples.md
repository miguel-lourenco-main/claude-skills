---
source: https://lovable.dev/guides/website-menu-examples
title: 10 Website Menu Examples: Which Navigation Type Fits Your Site?
topic: menu type catalog and selection
value: 5
keep: yes
---

## Use when
Selecting which menu widget/pattern (not overall site structure) to implement for a given page count, content depth, and device mix.

## Rules
- Choose menu type from three factors: content volume, audience device mix (mobile vs desktop), and build complexity you can actually support.
- Hiding navigation entirely behind an icon measurably slows task completion and reduces navigation use versus visible nav (per Nielsen Norman Group, per guide) — prefer showing some items and hiding only the rest.
- Sizing bands for menu type: 7 or fewer main sections → horizontal nav bar; 8-20 items in clear groups → dropdown menu; 20+ items or 3+ level deep hierarchy or any ecommerce catalog → mega menu (collapsing to hamburger on mobile).
- For hamburger/mobile menus, use a hybrid rather than fully hidden nav: show 3-5 critical items visibly, tuck the rest behind the hamburger icon (per Nielsen Norman Group, per guide).
- Mega menus need a deliberate hover delay (recommended 300-500ms) before opening; 60% of sites get this wrong and produce flicker (per Baymard research, per guide) — treat the delay as a required implementation detail, not a nice-to-have.
- 88% of top US ecommerce sites use hover-based mega menus (per Baymard research, per guide) — a reasonable default for large product catalogs, but only above ~20 main categories; below that, plain dropdowns or horizontal nav are simpler and sufficient.
- Breadcrumbs are additive, not a replacement for primary navigation; add them only at 3+ levels of depth — below that they add clutter without value.
- Sidebar (vertical) navigation fits documentation sites, dashboards, and any site with 20+ main items, or 5-10 page portfolios/service sites should stay with simple horizontal nav instead.
- Footer navigation should function as a secondary/complete site index and a conversion safety net — group it into clear semantic sections rather than a single flat link dump.
- Fullscreen/immersive menus trade efficiency for brand impact; only justified for creative portfolios/studios, and only if labels stay clear, the close action is obvious, and keyboard access is preserved even in the immersive mode.
- Split navigation (separate primary-content nav vs. utility nav, e.g., account/cart/search on the opposite side) fits sites serving multiple audience segments or separating browsing from account management; adds layout complexity, so reserve it for that specific need.
- Sticky/fixed headers help content-heavy, long-scroll pages; watch mobile screen budget specifically since a mistimed reveal or oversized sticky bar creates its own friction (test whether it obscures content on small screens).

## Patterns (name — when to use — when to avoid)
- Horizontal navigation bar — 5-7 main pages, simple service/portfolio sites — avoid past 7 items; it becomes crowded, especially on mobile.
- Sticky/fixed navigation — long, content-heavy pages needing constant access to other sections — avoid oversized/slow-appearing implementations that eat mobile screen space.
- Hamburger menu — mobile default, or minimalist desktop — avoid fully hiding everything with zero visible items; use the 3-5-visible hybrid instead.
- Mega menu — 20+ categories, large ecommerce catalogs — avoid under 20 categories (dropdowns suffice) and avoid skipping the hover-delay tuning.
- Sidebar navigation — SaaS apps, dashboards, docs, 20+ main items, extended user sessions — avoid for small 5-10 page marketing/portfolio sites.
- Dropdown menu — 8-20 main items in clear groups — avoid once groupings grow complex/deep enough to need multi-column mega-menu treatment.
- Footer navigation — every site, as a secondary/legal/site-index layer — avoid dumping unsorted links; group by semantic section.
- Breadcrumb navigation — sites 3+ levels deep (ecommerce, docs, nested blogs) — avoid on sites only 1-2 levels deep (adds clutter, no value).
- Fullscreen navigation — creative portfolios/studios where the menu is part of brand storytelling — avoid for utility-first/content-heavy or conversion-focused sites where speed matters more than impact.
- Split navigation — multi-audience sites, ecommerce/SaaS separating content browsing from account/utility actions — avoid for single-audience simple sites; unnecessary layout complexity.

## Anti-patterns
- Fully hiding navigation behind an icon with zero visible items on mobile or desktop.
- Shipping a mega menu without tuning hover delay (causes flicker).
- Using mega-menu complexity below ~20 categories when a simple dropdown would serve.
- Adding breadcrumbs to a site only 1-2 levels deep.
- Adopting split or fullscreen navigation patterns without a matching multi-audience or brand-storytelling need — added complexity with no payoff.

## Checklist (only if the guide supports one)
- [ ] Menu type chosen from actual page/category count, not aesthetic preference
- [ ] Mobile shows 3-5 visible priority items before falling back to hamburger
- [ ] Mega menu (if used) has a tuned 300-500ms hover delay
- [ ] Breadcrumbs present only where depth is 3+ levels
- [ ] Footer links grouped into clear semantic sections
- [ ] Any fullscreen/split menu pattern justified by a specific brand or multi-audience need, and keyboard-accessible
