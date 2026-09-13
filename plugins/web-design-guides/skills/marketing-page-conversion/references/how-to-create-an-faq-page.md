---
source: https://lovable.dev/guides/how-to-create-an-faq-page
title: How to Create an FAQ Page That Converts
topic: FAQ page structure, accessibility, schema
value: 3
keep: partial
---

## Use when
Building or restructuring an FAQ page/section for a marketing site.

## Rules
- Source questions from real evidence, not guesses: support tickets/emails, sales-call objections, on-site search queries, and community/social comments — in that priority order for new sites without data, use competitor FAQs or first-visit user observation instead.
- Group into categories capped at 5–7 questions each; pick one consistent voice ("we," "you," or neutral) and hold it throughout.
- Answer structure: lead with the direct answer in 1–2 sentences, then add context/detail after. Keep answers self-contained; link out only for genuinely deep material (return policy, setup docs).
- Layout choice by volume: accordion/collapsible for mobile and long pages; category tabs or anchor links for desktop; add a search box once the page passes ~20–25 questions total.
- Mobile: touch targets ≥44pt (per Apple Human Interface Guidelines, per guide), single-column stacking, body text ≥16px.
- Accessibility for expand/collapse controls: `aria-expanded` (true/false), `aria-controls` linking button to its answer block, `role="button"` on non-`<button>` clickable elements; use real heading tags in order; ensure full keyboard tab/Enter operability; write descriptive control labels ("expand shipping information," not "click here").
- FAQPage JSON-LD schema increases rich-snippet eligibility, but as of the source's citation (Aug 2023) this display is limited mostly to government/health sites — don't assume rich results will render for a typical commercial FAQ page. Validate markup with Google's Rich Results Test before shipping. Never duplicate the same FAQ content verbatim across multiple pages (confuses which version search engines should surface).
- Place FAQ access in navigation/footer, plus contextual "Need help? See FAQs" links at checkout, signup, product, and support touchpoints; keep the label consistent site-wide (pick one of "FAQ," "Help," or "Support").
- Review/update quarterly or after major product/pricing changes; track which questions get the most engagement to decide what to expand vs. cut.

## Anti-patterns
- Random, uncategorized question lists.
- FAQ answers that bury the direct answer under preamble.
- Duplicating identical FAQ content across multiple URLs.
- Inconsistent labeling ("FAQ" in nav, "Support" in footer, "Help" in a banner).
- Letting the page go stale after a pricing/policy change.

## Checklist
- [ ] Questions sourced from real support/sales/search evidence
- [ ] Categories ≤5–7 questions each, one consistent voice
- [ ] Answers lead with the direct answer, self-contained
- [ ] Accordion/tabs/search chosen by question volume
- [ ] aria-expanded / aria-controls / role="button" present on toggles
- [ ] FAQPage schema validated via Rich Results Test
- [ ] FAQ linked from nav/footer and contextually at checkout/signup/product pages
