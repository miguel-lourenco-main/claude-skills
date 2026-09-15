---
source: https://lovable.dev/guides/master-ux-seo-7-steps
title: How to Master UX SEO in 7 Steps
topic: technical UX/SEO thresholds (Core Web Vitals, nav, mobile, schema)
value: 4
keep: yes
---

## Use when
Setting concrete technical/UX targets for a page or site (performance budgets, navigation structure, mobile layout, structured data) rather than pure copy/layout decisions.

## Rules
- Core Web Vitals thresholds to design/build against: LCP < 2.5s, INP < 200ms, CLS < 0.1, measured at the 75th percentile of real-user Chrome data (per Google's Core Web Vitals methodology, per guide) — lab-only testing during development does not count toward ranking; verify with field data (Search Console / CrUX), not just PageSpeed Insights lab runs.
- Match content format to query intent: informational → comprehensive/educational content with credentialed authorship; navigational → clear direct path to the named page; commercial-investigation → comparisons/reviews; transactional → product pages with visible pricing and a clear conversion path. Foundry research: intent-matched content increased CTR 220% vs. non-intent-matched (per Foundry, per guide).
- Ignore the "3-click rule" as a hard constraint — Nielsen Norman Group states there's no data supporting it (per NNG, per guide); what matters is information scent (clear signals of where a link leads), not click count. Google's own crawl-efficiency guidance suggests keeping most pages within 3–4 clicks of the homepage, but that's a crawler concern, not a user-abandonment threshold.
- Breadcrumbs should represent site hierarchy, not browsing history, with every step except the current page clickable.
- Navigation labels should be descriptive and keyword-bearing ("Web Application Development," not "Our Services"); cap navigation items around 10 per level to balance discoverability against cognitive load (per Baymard Institute, per guide).
- Above-the-fold image handling is the highest-leverage LCP fix; never lazy-load above-the-fold images (actively harms LCP) — only apply lazy loading below the fold.
- Mobile-first indexing is exclusive as of the source's citation (Google uses only Googlebot Smartphone since July 5, 2024, per guide) — the mobile version must have full content parity with desktop (same text/images/video/structured data), since that's the only version Google evaluates.
- Mobile touch target minimum: 48 device-independent pixels (~9mm); body text ≥16px; interactive element text ≥~20px, to avoid forcing zoom.
- Use JSON-LD (not microdata/RDFa) for structured data — Google's stated preference. Prioritize schema types by what the page actually offers: BreadcrumbList (hierarchy), FAQ (Q&A capture), Product (pricing/reviews), HowTo (step content).
- Treat performance/UX monitoring as continuous: check Search Console Core Web Vitals (field data / ranking-relevant) at least weekly, and use PageSpeed Insights (lab data) to diagnose the specific cause once a field metric fails.
- Page experience (Core Web Vitals + mobile-friendliness + HTTPS + no intrusive interstitials) acts as a tie-breaker between otherwise similarly relevant pages — it does not override content relevance as the dominant ranking factor.

## Anti-patterns
- Lazy-loading above-the-fold hero images.
- Treating a passed lab-tool score (PageSpeed Insights) as proof of good Core Web Vitals without checking real-user field data.
- Designing navigation purely to minimize click-count rather than to maximize information scent.
- Publishing structured data types that don't match what the page actually contains.
- Mobile pages missing content that exists on desktop (breaks content-parity requirement of mobile-first indexing).

## Checklist
- [ ] LCP < 2.5s, INP < 200ms, CLS < 0.1 at 75th percentile (field data, not just lab)
- [ ] Above-the-fold images are not lazy-loaded; below-fold images are
- [ ] Mobile version has full content parity with desktop
- [ ] Touch targets ≥48px DIP, body text ≥16px
- [ ] Breadcrumbs reflect hierarchy, all steps but current page are links
- [ ] Structured data in JSON-LD, matched to actual page content type
- [ ] Core Web Vitals checked against Search Console field data weekly
