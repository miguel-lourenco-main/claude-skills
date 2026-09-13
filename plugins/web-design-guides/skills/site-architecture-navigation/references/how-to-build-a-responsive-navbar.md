---
source: https://lovable.dev/guides/how-to-build-a-responsive-navbar
title: How to Build a Responsive Navbar (Step-by-Step)
topic: responsive navbar implementation
value: 4
keep: yes
---

## Use when
Implementing or reviewing a site's primary navbar component across breakpoints, including its accessibility behavior.

## Rules
- Treat "responsive" as covering layout AND accessibility together — keyboard operability, contrast, and screen-reader labeling are part of the responsive requirement, not an optional add-on.
- Common breakpoint bands to design against: mobile ~320-480px (sometimes to 576px), tablet ~481-768px (sometimes from 577px), desktop ~769-1024px+ (sometimes from 1025px) — unsourced, treat as a starting convention, not a spec.
- Before layout work, list the top 5-6 actions the navbar must support; let that list drive what appears versus what gets cut.
- Standard navbar anatomy: logo, 4-6 primary links, one visually distinct primary CTA.
- Place the logo on the left (acts as a home link) and keep the primary CTA visually distinct (separate color/button treatment) and present at every breakpoint.
- Center nav links should represent top user journeys, not internal business/org structure.
- Secondary utilities (login, search, cart) can live in the navbar but should carry less visual weight than the primary CTA.
- Desktop convention: logo left, links center, utility actions + CTA right — matches how users already scan a page.
- Use dropdowns for desktop when there are multiple categories, but keep each dropdown's own labels concrete (e.g., name the actual sub-items) rather than hiding everything under a vague top label.
- Give links enough spacing to feel clickable without feeling disconnected from each other — avoid both cramped and overly sparse spacing.
- Typical mobile collapse breakpoint is around 768px, switching primary links into a hamburger menu.
- Never bury the primary CTA inside the collapsed mobile menu — keep it visible/accessible outside the hamburger.
- The hamburger trigger must be a real `<button>` element with a descriptive accessible label (e.g., "Open navigation menu"), not a styled div/icon with a click handler.
- Sticky navigation is a good default polish addition — it keeps the primary conversion path reachable while scrolling.
- Provide visible hover states, active-page highlighting, and visible focus rings for every interactive nav element.
- Full navbar must be operable by keyboard alone: tab to every link/dropdown/button, Enter to activate, Escape to close mobile/dropdown menus.
- Dropdown and collapsed-menu state (expanded/collapsed) and current-page state must be exposed to screen readers, not just visually implied.
- Meet WCAG AA contrast (4.5:1 for normal text) and provide adequately sized tap targets for touch devices.
- Keep navbar behavior consistent across breakpoints — logo position, search, and primary actions should not relocate or vanish unpredictably between desktop and mobile.
- Test explicitly at representative widths (e.g., 320px, 768px, 1024px) and via keyboard-only traversal before shipping.

## Patterns (name — when to use — when to avoid)
- Desktop dropdown menu — multiple product/service categories on desktop — avoid vague catch-all labels like "Solutions" over concrete sub-items; avoid on mobile without a redesigned interaction.
- Hamburger menu (mobile) — space-constrained mobile layout — avoid making it the only way to reach the primary CTA; avoid non-button implementations.
- Sticky navbar — keeping conversion path reachable on any page with meaningful scroll — avoid if it consumes excessive vertical space or obscures content on small screens.

## Anti-patterns
- Cramming many service/product categories into flat navbar labels so the important ones get buried under generic terms.
- More than roughly 5-7 primary items causing decision paralysis; unsorted overflow should move into dropdown groupings instead of the top level (unsourced: "12+ choices often choose none").
- Hiding the primary CTA in the collapsed mobile menu.
- Building the hamburger trigger as a non-semantic element (image/div) instead of a real button with an aria label.
- Low text/background contrast that fails WCAG AA.
- Navbar behaving or positioning differently between desktop and mobile in ways that break user expectations.

## Checklist
- [ ] Top 5-6 user actions identified and mapped to nav items before layout
- [ ] Logo left, CTA visually distinct and present at every breakpoint
- [ ] Center links reflect user journeys, not org chart
- [ ] Desktop dropdowns (if any) use concrete sub-item labels
- [ ] Mobile collapses to hamburger around ~768px with real `<button>` + accessible label
- [ ] Primary CTA remains visible outside the collapsed mobile menu
- [ ] Hover, active, and focus states implemented for all interactive items
- [ ] Fully keyboard-operable: Tab, Enter, Escape all work as expected
- [ ] Expanded/collapsed and current-page state exposed to screen readers
- [ ] WCAG AA contrast (4.5:1) and adequate touch target sizes verified
- [ ] Manually tested at ~320px, ~768px, ~1024px and via keyboard-only pass
