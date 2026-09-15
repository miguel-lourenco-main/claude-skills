---
source: https://lovable.dev/guides/dark-mode-website-examples-guide
title: "Dark Mode Websites: 10 Stunning Examples and What Makes Them Work"
topic: dark mode implementation rules
value: 4
keep: yes
---
## Use when
Designing or reviewing a dark theme/mode for a site or product surface.

## Rules
- Never use pure black (#000000) as a primary dark-mode surface. Use a dark gray instead — guide cites Material Design's recommendation of #121212 and Apple HIG's range of #1C1C1E–#3A3A3C.
- Meet WCAG contrast minimums independently in each theme: 4.5:1 for normal text, 3:1 for large text (per WCAG, per guide). Offering a dark theme does not by itself satisfy contrast requirements — verify contrast in the dark palette separately from the light one.
- Light text on a dark background reads as optically thinner than dark text on light. Compensate by: bumping font weight one level, adding ~0.01–0.02em letter-spacing, and using 1.4–1.5 line-height.
- Limit accent colors to 1–2 per dark theme, reserved for elements that need genuine emphasis (buttons, key CTAs, status). Do not spread brand color across incidental UI.
- Reserve pure/near-black and maximal contrast specifically for content-forward, media-heavy contexts (video, game art, album covers) where you want content to visually pop against the background — this is a deliberate exception to the "avoid pure black" rule, used by e.g. Netflix and Steam-style dark UIs.
- Consider offering more than one dark variant when your audience spans sensitivity levels: e.g., a "dimmed" dark mode for users who find standard dark too harsh in extended sessions, plus a high-contrast dark mode for low-vision users, plus colorblind-safe variants where color alone encodes meaning (e.g., diffs/status). One dark theme is not a universal solution.
- Use a systematic build/verify loop: pick the palette → verify contrast with a checker tool → adjust typography → limit accents → test across content types (text, images, embedded media) before shipping.

## Patterns (name — when to use — when to avoid)
- Theme-as-narrative-device (deep/near-black background used to frame content like gallery walls, e.g., portfolio sites) — use for creative/portfolio work where darkness itself signals mood; avoid for information-dense or form-heavy interfaces where it adds no communicative value.
- Visual-metaphor dark theme (e.g., "deep space" palette to signal technical depth for a SaaS/dev-tool brand) — use when the metaphor maps to real product positioning; avoid applying a mood palette inconsistently (partial application undercuts the metaphor).
- Multi-variant dark mode (standard / dimmed / high-contrast / colorblind-safe) — use for developer tools and any product with extended daily sessions; avoid over-engineering this for a low-traffic marketing site where one well-tuned theme suffices.

## Checklist
- [ ] Primary dark surface is not #000000; uses a dark gray (~#121212–#1C1C1E range).
- [ ] Both light and dark themes independently pass 4.5:1 (normal text) / 3:1 (large text) contrast.
- [ ] Text weight/letter-spacing/line-height adjusted for the dark theme, not reused unmodified from light.
- [ ] No more than 1–2 accent colors carry emphasis in the dark theme.
- [ ] Tested readability across text, image, and embedded-media content types.
