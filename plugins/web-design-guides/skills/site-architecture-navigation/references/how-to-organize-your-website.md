---
source: https://lovable.dev/guides/how-to-organize-your-website
title: How to Organise Your Website for Better UX & SEO
topic: IA audit, labeling, and testing process
value: 5
keep: yes
---

## Use when
Reorganizing or auditing an existing site's structure and navigation labeling, or validating a proposed IA before building it.

## Rules
- Audit before redesigning: map every existing page and observed user path first; redesigning without this repeats the same problems in a new shape.
- Build a content inventory (URL, type, publish/update date, word count, internal link count) and flag: duplicate content, orphaned pages (zero internal links), and low-performing pages (high bounce, low time-on-page) as consolidation/rewrite candidates.
- Use behavior-flow/path data to see where users drop off in key journeys; pages with high traffic but low conversion usually signal a structural or expectation mismatch, not a content problem.
- If mobile traffic share is high and mobile bounce meaningfully exceeds desktop, prioritize mobile UX/navigation fixes first (guide's own example threshold, unsourced as a general rule: ≥60% mobile traffic with >10pp higher bounce than desktop).
- Choose navigation pattern primarily by category count and hierarchy depth (see decision table below); this guide's specific bands: 3-7 categories/shallow → horizontal; 8-15 categories/2-3 levels → sidebar or accordion-style multi-level toggle; 15+ categories/deep hierarchy → mega menu (collapsing to hamburger on mobile).
- Label navigation items in plain, specific language over clever/internal terms (e.g., "Plumbing Services" not "Solutions"); avoid vague catch-alls like generic "Resources."
- Keep parallel grammatical construction across all items at a given nav level — either all nouns or all verb-phrases, not mixed.
- Organize categories around user tasks/outcomes, not internal department names; test task-based labels against topic-based labels with real users since either can win depending on the site.
- Validate structure with functional clickable prototypes rather than static wireframes — cheaper to test and iterate same-day.
- Run card sorts to discover natural groupings: open card sort (users invent categories) for structures built from scratch; closed card sort (predefined categories) to validate an existing structure.
- Keep total links per page (nav + body + footer) restrained — excessive link volume dilutes attention on the primary action.
- Prefer contextual in-body links with descriptive anchor text over generic "click here"; body links carry stronger relevance signal than nav links.
- Build hub pages for key topics with bidirectional linking (hub → cluster pages, cluster pages → hub) to create clear topical/hierarchical relationships.
- Roll structural changes out incrementally: pilot one high-traffic section with clear conversion goals and a documented baseline, measure against that baseline, then expand validated changes sitewide.
- Track post-launch impact for 30-60 days: bounce rate, time on page, internal link click-through, conversion completions, pages per session — compare to your own pre-change baseline rather than external targets.

## Patterns (name — when to use — when to avoid)
- Horizontal navigation — 3-7 categories, shallow hierarchy — avoid once category count or depth grows past this, since it forces cramped items.
- Sidebar navigation — 8-15 categories, 2-3 levels — avoid for very small (<8 category) simple sites where it adds unneeded chrome.
- Multi-level accordion/toggle navigation — 5-15 main categories with 2-3 subcategory levels, especially mobile-first — avoid for very shallow sites where a flat list would do.
- Mega menu — 15+ categories, deep hierarchies — avoid below ~15 categories; collapses to hamburger on mobile regardless.
- Hub-and-spoke content linking — topics with a natural pillar page and several detailed sub-pages — avoid when content doesn't cluster around a small number of central themes.

## Anti-patterns
- Navigation labels mirroring the internal org chart (Marketing/Sales/Support) instead of user tasks.
- Clever/interpretive labels ("Explore," "Click Here") that force users to guess instead of recognize.
- Mixed grammatical construction within one nav level (some nouns, some verb phrases).
- Committing to a full redesign before auditing existing pages/traffic patterns.
- Validating IA with opinion ("does this make sense?") instead of observed task-based behavior.
- Rolling out structural changes sitewide at once instead of piloting one section first.

## Checklist (only if the guide supports one)
- [ ] Content inventory built; duplicates, orphans, and low performers flagged
- [ ] Drop-off points identified from path/behavior-flow data
- [ ] Navigation pattern chosen from category count + hierarchy depth
- [ ] All nav/menu labels plain-language, specific, and parallel in construction
- [ ] Categories organized around user tasks, not departments
- [ ] Card sort (open or closed, as appropriate) run with 5-10 users
- [ ] Structure validated via clickable prototype (tree test / first-click test) before build
- [ ] Pilot section chosen by traffic + conversion goal + baseline metrics
- [ ] Post-launch metrics tracked for 30-60 days against that baseline
