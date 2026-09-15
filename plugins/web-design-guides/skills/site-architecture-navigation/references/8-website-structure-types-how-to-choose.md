---
source: https://lovable.dev/guides/8-website-structure-types-how-to-choose
title: 8 Website Structure Types: How to Choose the Right One for Your Site
topic: site structure type selection
value: 5
keep: yes
---

## Use when
Choosing or auditing the top-level information architecture pattern for a site, before deciding menu type or building navigation.

## Rules
- Pick structure from four inputs: current content volume, user behavior pattern, feature requirements, and growth projection for the next 6-12 months.
- Default to hierarchical structure unless a specific need pushes toward another type; it matches how people think (general → specific).
- Content-volume bands to size the primary structure: 0-20 pages → flat; 20-50 pages → simple hierarchy (2-3 levels); 50-100 pages → expanded hierarchy plus search; 100+ pages → database-driven architecture.
- Most real sites end up hybrid: assign a structure type per section rather than forcing one pattern site-wide (e.g., hierarchical browsing + sequential checkout + database-driven search/filter).
- Sequential (step-by-step) structure should be embedded inside a broader hierarchical/hybrid site for a specific task (checkout, onboarding, application), not used to organize an entire site.
- Matrix (cross-linked) structure is an addition layered onto an existing simpler base once content relationships are mapped — don't start with it.
- Deep structures (4+ clicks) become necessary only at large scale (100+ pages, multi-department orgs); flatten wherever content volume allows since navigation gets harder as depth increases (unsourced: "beyond 3 clicks").
- Flat structure (every page 1-2 clicks from home) degrades past roughly 20-30 pages — menus become unwieldy.
- Validate structure choice before building: use card sorting, tree testing, and first-click testing against real users, not internal opinion.

## Patterns (name — when to use — when to avoid)
- Hierarchical — 30-100 pages in 3-7 primary categories, stores with 50+ products, multi-department company sites, taxonomy-driven content — avoid when content needs multi-directional cross-linking (use matrix) or exceeds manual organization (use database).
- Sequential — checkout flows, onboarding, progressive courses, multi-step applications — avoid as a whole-site structure; scope it to one task flow inside a hierarchical/hybrid site.
- Matrix — knowledge bases, reference sites, educational platforms with interconnected topics — avoid as a starting structure; requires relationship mapping, so add after a base structure exists.
- Database-driven — large/frequently-updated inventories, job boards, real estate, user-generated content, 100+ pages — avoid for small static content sets where manual organization is still cheap.
- Hub-and-spoke — pillar/topic-authority content, service pages with detailed sub-pages, resource centers — avoid when content doesn't cluster around a small number of central topics.
- Flat — under ~20 pages, portfolios, landing pages, simple single-location service businesses — avoid past ~20-30 pages (menu clutter).
- Deep (multi-level nested) — large organizations, government/university sites, multi-product enterprise docs (100+ pages) — avoid for smaller sites; extra clicks frustrate users when not warranted by real complexity.
- Hybrid — most sites past startup phase (50-100+ pages), ecommerce, content-marketing sites, SaaS — avoid over-engineering a small/simple site with multiple structure types it doesn't need.

## Anti-patterns
- Defaulting to whatever the template/builder provides instead of deliberately matching structure to content volume and user behavior.
- Organizing navigation around the internal org chart/department names instead of user tasks and mental models.
- Committing to a structure from wireframes/opinion without card sorting, tree testing, or first-click testing.
- Treating "looks sophisticated" (e.g., adding matrix or mega-style cross-linking) as a substitute for matching structure to actual function and maintainability.
