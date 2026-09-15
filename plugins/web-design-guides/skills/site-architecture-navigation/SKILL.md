---
name: site-architecture-navigation
description: Decide a website's information architecture and navigation — structure type (flat, hierarchical, hub-and-spoke, database-driven, hybrid), menu pattern (horizontal, dropdown, mega menu, sidebar, hamburger, split, fullscreen), mobile nav, breadcrumbs, search, footer, accessible navbar build rules, and IA audits/tests — from distilled, source-tagged rules (Lovable's public web-design guides, which cite NN/g and Baymard). Use when the user says "how should I structure this site", "design the navigation", "what menu type should I use", "mega menu or dropdown", "mobile nav / hamburger", "audit my navigation", "organize my website", or "plan the sitemap". NOT for landing-page section order, CTAs or conversion copy (use marketing-page-conversion), and NOT for general responsive/motion/app UI rules (use web-ui-foundations).
---

# Site architecture & navigation

Navigation fails when it is picked as a visual element instead of designed as architecture.
This skill is an **index**: the rules below settle most questions on their own. Each row in §6
points to one distilled guide note (40–60 lines) in `references/` beside this file. Read a note
only when a rule here is not enough, and read only that note.

## 1 · Pick the structure before the menu

Decide from four inputs: page count now and in 6–12 months, how people move (browse, search,
step through a task), features, and growth. Default to hierarchical unless one of these pushes
elsewhere.

| Content volume | Structure |
|---|---|
| 0–20 pages | flat |
| 20–50 | simple hierarchy, 2–3 levels |
| 50–100 | expanded hierarchy + site search |
| 100+ | database-driven (implies dynamic or hybrid rendering) |

- Most real sites are **hybrid**: assign a structure per section (hierarchical browse, sequential
  checkout, database-driven search).
- Sequential structure is for one flow (checkout, onboarding), never the whole site.
- Matrix cross-linking is layered onto an existing base once relationships are mapped, never a
  starting point. Hub-and-spoke suits pillar-topic resource centres.

## 2 · Choose the menu pattern from volume, depth and device mix

| Situation | Pattern |
|---|---|
| ≤7 top-level items | horizontal bar |
| 8–20 items in clear groups | dropdown |
| ~15–20+ categories, 3+ levels, or any catalog | mega menu (collapses to a drawer on mobile) |
| 20+ items, docs, dashboards, long sessions | sidebar |
| distinct audiences, or browsing vs account/cart | split nav |
| creative studio where the menu is brand storytelling | fullscreen, with clear labels, an obvious close, keyboard access |

The guides disagree on the dropdown→mega crossover (15 vs 20): treat it as a range. Mega menus
need a **300–500 ms hover delay** or they flicker. Pick for 6–12 months of growth: a sidebar
absorbs new items, a horizontal bar degrades until it forces a rebuild.

## 3 · Apply the core rules on every site

- Labels are plain and task-based ("Plumbing services", never "Solutions"/"Explore"), with
  parallel grammar within one level.
- "7 items" is a forcing function, not a cognitive law (NN/g rejects the Miller's-7 reading);
  cap around 10 per level (Baymard).
- Never hide all navigation behind an icon. Show 3–5 priority items and put the rest in the menu.
  Label the hamburger "Menu".
- The primary CTA stays outside the collapsed menu at every breakpoint.
- Mark the current page with more than colour (WCAG technique G128): pair a colour change with a
  weight or underline change.
- Breadcrumbs only at 3+ levels. They are hierarchy-based (never history), and every crumb except
  the current page is a link.
- Search is a visible input on every page, ≥30 characters wide, with a button labelled "Search",
  scoped to the whole site by default.
- The footer is a grouped second navigation layer (returns, shipping, contact, site index), not a
  flat link dump.
- A sticky header uses ≤20–30% of mobile screen height and appears without lag.
- Design the nav at ~375 px first with 4–5 items, then expand.
- The "3-click rule" has no supporting data. Optimise information scent (labels that predict the
  destination), not click count.

## 4 · Build the navbar accessibly

- The toggle is a real `<button>` with an accessible name ("Open navigation menu"), exposing
  expanded/collapsed state (`aria-expanded`).
- Every link, dropdown and button is reachable with Tab and activates with Enter. Escape closes
  open menus.
- The current page is exposed to screen readers, not only visually (`aria-current="page"` is the
  standard WAI-ARIA way).
- Text contrast ≥4.5:1. Touch targets ≥48×48 CSS px (Google) or ≥44 pt (Apple). The navigation
  notes only say "thumb-sized"; the numbers come from marketing-page-conversion's notes.
- Collapse near 768 px (common convention, unsourced). Test between breakpoints, not only at them.

## 5 · Audit and test before committing

1. Inventory every page (URL, type, dates, word count, internal links). Flag duplicates, orphans
   (zero inlinks) and low performers.
2. Read behaviour-flow data. A high-traffic, low-conversion page usually means a structural or
   expectation mismatch, not bad content.
3. Validate with users on a clickable prototype. Use open card sort for a new IA, closed card
   sort or tree test to validate one, and first-click tests. Track success rate, first-click
   accuracy and directness.
4. Pilot the change on one high-traffic section with a documented baseline, then compare after
   30–60 days before rolling out site-wide.

## 6 · Index — read one note when §1–5 are not enough

| Question | Read |
|---|---|
| Which structure type, hybrid mixes, growth planning | `references/8-website-structure-types-how-to-choose.md` |
| Which menu widget, per-pattern when/avoid, footer, breadcrumbs | `references/website-menu-examples.md` |
| Evidence-backed nav checklist: active state, search, sticky, footer, testing metrics | `references/website-navigation-best-practices-that-convert.md` |
| Navbar build: breakpoints, hamburger, keyboard, ARIA, touch | `references/how-to-build-a-responsive-navbar.md` |
| IA audit, labelling, card sort / tree test, pilot rollout | `references/how-to-organize-your-website.md` |

Each note's frontmatter carries its source URL and a value score (1–5).

## Provenance

Distilled on 2026-09-13 from the public guides at lovable.dev/guides, paraphrased, never copied.
A statistic is kept only when the guide names its source. "Per guide" means second-hand, so
check the original before quoting a number to a client. Guides with no transferable rules were
excluded; the full triage is in the plugin's `sources.tsv`.
