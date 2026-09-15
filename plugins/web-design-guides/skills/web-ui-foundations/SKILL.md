---
name: web-ui-foundations
description: General web and product UI design rules — responsive layout, fluid type and images, dark mode and theming, scroll and motion pattern selection with accessibility, current design trends and when to skip them, mobile app UX (onboarding, bottom nav, performance budgets, empty states), chatbot and AI chat interfaces, a right-sized UX process for small teams, and design-system scope — from distilled, source-tagged rules (Lovable's public web-design guides, which cite WCAG, NN/g and platform docs). Use when the user says "make this responsive", "add dark mode properly", "should I use infinite scroll / parallax / horizontal scroll", "is this trend worth using", "design the mobile app experience", "design a chatbot UI", "how much UX process do I need", or "do we need a design system". NOT for palettes, font pairings or style catalogs (use ui-ux-pro-max), NOT for navigation/IA (use site-architecture-navigation), NOT for conversion pages (use marketing-page-conversion), NOT for award-style scroll storytelling (use marketing-presentations).
---

# Web UI foundations

The rules that apply under any visual style. This skill is an **index**: §1–6 settle most
decisions, and §7 points to one distilled note per guide in `references/` beside this file. Read
a note only when a rule is not enough.

## 1 · Build responsive from the small screen up

- Design mobile-first; the constraint forces the prioritisation every size benefits from.
- Prefer Grid `repeat(auto-fit, minmax())` and Flexbox over hand-written breakpoints. Use container
  queries when a component's layout depends on its slot rather than the viewport.
- Type is `clamp(<rem>, <vw>, <rem>)`. Rem bounds are required, because raw `vw` ignores browser
  zoom.
- Images: `srcset`/`<picture>`, WebP/AVIF, explicit width and height (no layout shift), and lazy
  loading only below the fold, never on the hero.
- Test in three passes: at breakpoints, by dragging continuously between them, and on real
  devices, since emulators miss iOS viewport and touch behaviour.

## 2 · Theme and dark mode

- Dark surfaces are dark grey (~#121212–#1C1C1E), not pure black. The exception is deliberate
  near-black behind media-first content such as video or game art.
- Check contrast separately in every theme: 4.5:1 for body text, 3:1 for large text. Offering
  dark mode does not satisfy contrast.
- On dark, text gets +1 weight step, +0.01–0.02 em tracking and 1.4–1.5 line height.
- Use 1–2 accent colours per theme, for real emphasis only. Long-use or status-colour products may
  need dimmed, high-contrast or colour-blind-safe variants.

## 3 · Choose scroll and motion from content and goal, never from trend

| Content / goal | Pattern |
|---|---|
| narrative, emotional | scrollytelling, reader-paced |
| visual galleries | horizontal scroll or 3D, with keyboard support |
| discovery feeds | infinite scroll |
| goal-directed: search, compare, checkout | pagination or "Load more", **never** infinite scroll |

- Every motion effect honours `prefers-reduced-motion`. That is WCAG, and it protects people with
  vestibular disorders.
- Animate only `transform` and `opacity`. Parallax uses a `position: fixed` layer, not
  `background-attachment: fixed`, which breaks on iOS.
- Horizontal and 2D scroll regions need arrow keys and skip links. 2D scroll needs a
  single-direction fallback at 400% zoom.
- Micro-interactions confirm an action, teach an affordance or show progress. They never decorate
  body copy or navigation.
- Engagement comes from the reader controlling the pace, not from the animation itself.
- Trends age fastest. Adopt one only where its "use when" in the trends note matches the product.

## 4 · Mobile app experience

- The first session reaches value with no signup, permission or tutorial gate. Ask for data at
  the moment an action needs it.
- **Navigation**: a bottom nav holds 3–5 top-level destinations, and one hierarchy level never
  has two primary nav systems. Push transitions for drill-down, modals only for create/edit.
- **Performance budget**, set before building: first load <3 s, transitions <1 s. Use skeletons
  and optimistic UI, the latter only for reversible actions that usually succeed.
- **States**: every control has a visible pressed state. Every primary screen designs its three
  empty states (first launch, error, user-cleared) before the populated one.
- **Personalisation**: persist explicit choices and disclose any adaptation, never silently.

## 5 · Conversational and AI chat UI

- Design for turn-taking, not page layout. Every bot message leaves the user an obvious next move
  and never dead-ends.
- During any wait, show a typing indicator or stream the text. Named progress ("Searching your
  documents…") beats a spinner, and streaming gets a stop control.
- Offer quick replies for structured steps alongside free text for anything nuanced.
- Persona humanlikeness matches real capability; over-humanising a limited bot costs trust.
- **Failure states**: plain-language errors, interrupted streams marked "incomplete" with a retry,
  a human escalation path always visible, and uncertainty stated in first person.

## 6 · Right-size the process and the system

- Run empathise → define → ideate → prototype → test as a loop. Testing with 5 users surfaces
  ~85% of usability problems (Nielsen & Landauer).
- **Define and ideate**: frame problems as "[user] needs [action] because [insight]". Generate
  many ideas before filtering for fit and buildability.
- **Prototype**: match fidelity to the question being tested. More than a few days of prototype
  is overbuilt.
- **Test**: record behaviour ("4 of 5 couldn't find X"), not impressions. Triage findings into
  critical, important and nice-to-have.
- A design system is four jobs: tokens, components, docs and code integration. A small team
  usually needs consistency, not governance tooling; fix the job that is actually broken.

## 7 · Index — read one note when §1–6 are not enough

| Question | Read |
|---|---|
| Grid/container queries, images, fluid type, testing passes | `references/responsive-web-design.md` |
| Dark mode surfaces, contrast, type tweaks, variants | `references/dark-mode-website-design.md` |
| Scroll patterns (sticky, parallax, snap, horizontal, infinite) with a11y | `references/scrolling-design-patterns.md` |
| Interactive techniques matched to goal | `references/best-interactive-websites.md` |
| 2026 trends, each with use-when / avoid-when | `references/website-design-trends-2026.md` |
| Mobile app onboarding, nav, perf, feedback, personalisation | `references/mobile-app-experience.md` |
| Chatbot / AI chat UI | `references/chatbot-ui-design.md` |
| UX process for non-designers | `references/ux-process-for-non-designers.md` |
| Design-system scope · generative/creative-coding scoping | `references/best-design-system-tools.md` · `references/creative-coding-examples.md` |

## Provenance

Distilled on 2026-09-13 from the public guides at lovable.dev/guides, paraphrased, never copied.
Named sources are as cited by the guide (second-hand). Tool and pricing listicles were excluded;
the triage is in the plugin's `sources.tsv`.
