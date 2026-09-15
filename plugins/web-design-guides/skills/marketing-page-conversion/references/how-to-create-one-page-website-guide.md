---
source: https://lovable.dev/guides/how-to-create-one-page-website-guide
title: How to Create a One-Page Website (Complete Guide)
topic: one-page site structure and section order
value: 3
keep: partial
---

## Use when
Structuring a single-scroll one-page site (portfolio, product launch, small business) where the whole story fits in one continuous page.

## Rules
- Define exactly one primary action before any design work ("book a consultation," "collect email signups") — every other element must support, not compete with, this single goal. A page trying to serve multiple objectives (sell prints AND book sessions AND promote workshops) dilutes conversion for all of them.
- Draft section headings before building content — prevents scope creep/content sprawl later.
- Design system discipline: max two fonts (one heading, one body), one primary CTA color that contrasts with the rest of the palette (e.g. blue site theme → orange/green CTA), consistent spacing rules, one consistent image style (photography or illustration, not mixed).
- Give every section a unique anchor id (`#services`, `#testimonials`, `#contact`) both for smooth-scroll navigation and to give search engines a content-structure signal.
- Scannability requirements: short paragraphs (2–3 sentences max), bullet points for features/benefits, generous whitespace, high text/background contrast. Self-test: can a fast scroll-through convey the main message and next step in ~10 seconds? If not, simplify.
- Headline copy should promise a specific outcome, not name a category ("How We Cut Project Delays by 40%" beats "Our Services"; "Get Your Custom Quote in 24 Hours" beats "Contact").
- Keep CTA language consistent site-wide — if the primary CTA says "Schedule a consultation," secondary CTAs should say "Schedule now," not switch to "Contact us" or "Get started."
- Primary lead-capture form goes above the fold in the hero, with only essential fields (name, email, one qualifying question).
- Sticky navigation with anchor links to the most important sections, smooth-scroll CSS (`scroll-behavior: smooth`), and a "back to top" control for long pages; verify keyboard tab-through works for every anchor/interactive element.
- One H1 for the page, H2s for each major section — supports both content hierarchy and accessibility.
- Page speed: 2.4s pages converted at 1.9% vs. 1.5% for 3.3s pages in this guide's cited (unsourced) figures — treat as directional evidence that shaving load time on a heavy, image-dense one-pager matters more than usual, given a single page often carries all the site's images.

## Page anatomy (section order)
Hero (value proposition) → Problem → Solution → Benefits → Social proof → Features → Pricing/process → FAQ → Contact (final conversion opportunity).

## Anti-patterns
- Multiple unrelated primary goals on one page (e.g., sell + book + promote simultaneously).
- Inconsistent CTA wording across the page.
- Mixed image styles (stock photography next to illustration) breaking visual consistency.
- Skipping the fast-scroll 10-second comprehension test before shipping.

## Checklist
- [ ] Single defined primary action driving every section
- [ ] Section order follows hero→problem→solution→benefits→proof→features→pricing→FAQ→contact
- [ ] Max 2 fonts, 1 consistent accent CTA color, consistent image style
- [ ] Anchor IDs on every section, sticky nav, back-to-top control
- [ ] Primary lead form above the fold, ≤3 fields
- [ ] One H1, hierarchical H2s
- [ ] Passes the 10-second fast-scroll comprehension test
