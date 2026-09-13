---
source: https://lovable.dev/guides/how-to-build-multilingual-website
title: How to: Build a Multilingual Website
topic: multilingual site architecture and i18n
value: 4
keep: yes
---

## Use when
Deciding URL structure, hreflang setup, translation scope, and translation quality process for a site serving more than one language.

## Rules
- Language matters commercially, not just cosmetically: 76% of consumers prefer buying with information in their native language, and 40% will never buy from a site that lacks it (per CSA Research, per guide).
- Pick target languages from data, not assumption: use existing analytics/search-console traffic (visitor country, browser language, non-primary-language search queries) before committing to a language; for new markets, weigh market size against competitive intensity.
- Don't translate the whole site at once — translate conversion-critical pages first: homepage/nav, top product/service pages, checkout/contact, and trust content (About, testimonials). Validate demand before funding full-site translation.
- URL structure trade-off: subdirectories (`/es/`) consolidate SEO authority under one domain and suit most businesses; subdomains (`es.example.com`) separate more distinctly but dilute domain authority; ccTLDs (`.es`) give the strongest local signal but require managing separate domains/hosting. Default to subdirectories unless there's a specific reason not to.
- Hreflang tags are required for search engines to serve the right language variant — include self-referential tags, reciprocal tags between every language pair, and an `x-default` fallback for unmatched languages. Common failure modes: missing reciprocal tags, wrong language codes, missing self-reference.
- Client-side ("on the fly") translation does not produce SEO benefit — search engines index server-rendered HTML, so a translation applied after page load is invisible to crawlers. Only server-rendered translated pages count for local search visibility.
- Translation quality is a trust issue, not a nice-to-have: 59% of customers reportedly avoid businesses with poor language quality (unsourced named-source in guide — attributed only to "research"). Build a terminology glossary up front (brand terms, technical vocabulary, do-not-translate phrases) before translating anything.
- Hybrid translation workflow: machine translation + human post-edit runs roughly 30-60% of full human-translation cost (unsourced figure in guide) and suits straightforward content (product descriptions, docs); reserve full human translation for marketing copy and brand messaging where nuance/cultural context matters.
- Do keyword research per target language rather than translating your primary-language keyword list literally — local searchers often use different phrasing than a direct translation would produce.
- Local backlinks matter per language: a link from a Spanish-language site to your Spanish pages signals relevance more strongly than an English link to the same content.
- Track conversion/bounce/time-on-page separately per language — a page can underperform in one market and overperform in another, and that gap is the actual signal.

## Patterns (name — when to use — when to avoid)
- **Subdirectory i18n architecture** — `/lang/` paths under one domain with hreflang. Use for most multi-language sites. Avoid only if a market genuinely needs separate hosting/legal presence (then a ccTLD may be warranted).
- **Minimum-viable localization** — translate only conversion-critical pages first, expand later based on measured demand. Use when entering a new market speculatively. Avoid when the target market is already a proven, large revenue source — go full-site sooner.

## Anti-patterns
- Auto-redirecting users based on IP-detected location instead of letting them choose their language.
- Leaving UI chrome or error messages untranslated while body copy is translated.
- Ignoring RTL layout requirements for languages like Arabic.
- Skipping metadata and image alt-text translation.
- Relying on client-side/on-the-fly translation for SEO-relevant content.

## Checklist
- [ ] hreflang tags present: self-reference, reciprocal pairs, x-default
- [ ] Translated pages are server-rendered, not client-side swapped
- [ ] Terminology glossary exists before translation starts
- [ ] Conversion-critical pages (home, top products, checkout, trust content) translated first
- [ ] Per-language keyword research done, not literal translation of primary-language keywords
- [ ] RTL layout tested if any target language requires it
- [ ] Per-language analytics tracked separately
