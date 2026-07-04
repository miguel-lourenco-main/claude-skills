---
name: prospect-deepdive
description: Deep-dive research on a company in the Prospector store — gather ALL available information and write a usable, LLM-organized report (dossier). Use when the user says "deep dive on <company>", "research this company", "full dossier", "tell me everything about <company>", or to drain deep-dive requests queued from the dashboard (the ★/Deep-dive button). Writes dossiers/<id>.md; surfaces in the dashboard detail panel.
---

# Prospect · deep-dive

Produce a genuinely useful dossier on a company by combining what's already stored with **live web
research**, then let your judgement organize it. The point is a report the user can act on — including
things they weren't explicitly looking for but that help (a recent renovation, a new owner, heavy ad
spend, terrible reviews about the website, a competitor who just rebranded…).

## 0 · Setup

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
```

Two entry points:
- **From the dashboard queue** (the user clicked *Deep dive*): list what's waiting —
  `node "$PLUGIN/scripts/deepdive-pending.mjs"` → `items[]` with `reqId`, `companyId`, name, website, etc.
- **Direct**: the user names a company — resolve its id:
  `node "$PLUGIN/scripts/find.mjs" '{"q":"<name / domain / city fragment>"}'` → matches with their
  audit state, dossier/assessment flags. Ambiguous match → ask, don't guess.

## 1 · Gather (everything you can)

Start from the stored record (`companies/<id>.json` + `audits/<id>.website.json`), then **research live**
with WebSearch / WebFetch. If the audit captured screenshots (`screenshots/<id>/`), **Read a few tiles**
(desktop + mobile hero at least) — a dossier that talks about "their website" without having looked at
it reads hollow, and the visual state often IS the pitch. Reuse the audit's `taste.summary`/`issues`
rather than re-deriving them. Cast wide; pull whatever exists:

- **Identity & legal**: full legal name, NIF/NIPC, CAE, founding year, legal form, ownership/parent (Racius, registries).
- **Size & money**: employees, revenue/turnover if public, funding, growth signals.
- **Reputation**: Google / TripAdvisor / Zomato / Facebook ratings + review COUNT + recurring complaints/praises (esp. anything about the website, booking, or online experience).
- **Digital footprint**: their website (read it), socials (followers, last post, engagement), whether they run ads, booking/ordering platforms they depend on, tech stack.
- **Offering**: what they actually sell — menu/services/pricing, specialities, capacity, hours.
- **People**: owner/manager/decision-maker names + contactability (the person you'd pitch).
- **Context**: recent news, awards, renovations, expansions; local competitors and how their sites compare.

Cross-check facts across sources; note confidence. Don't invent — if something isn't found, say so.

## 2 · Write the dossier

Write to `dossiers/<companyId>.md`. **Always** start with this minimum-info header, then add
**LLM-organized sections that vary per company** — structure the findings however serves the user best:

```markdown
# <Company name>
**What they do:** <one line>  ·  **Vertical:** <x>  ·  **Location:** <city, district>
**Website:** <url or "none">  ·  **Phone:** <…>  ·  **Email:** <…>  ·  **Social:** <links>
**Redesign opportunity:** <0–1 from the audit, + one-line why>
**Why a lead:** <1–2 lines: can-pay signal + why a better site would move the needle>

---
## Deep dive
<your organized sections — e.g. Reputation & reviews · Current website verdict · Offering & pricing ·
Decision-maker & how to reach them · Competitive landscape · Notable findings · Outreach angle.
Include the unexpected-but-useful. Cite sources inline. Flag low-confidence items.>

## Sources
- <url> — <what it gave>
```

Keep it tight and scannable: the header is the at-a-glance; the deep dive is the substance.

## 3 · Resolve

After writing each company's dossier, mark its request handled so it leaves the dashboard's pending list:

```bash
node "$PLUGIN/scripts/deepdive-resolve.mjs" '{"reqId":"<reqId>","summary":"dossier for <name>"}'
```

The dashboard then shows the dossier in the company's detail panel (and the `Deep dive` button becomes
"View dossier"). The dossier is markdown — the user reads it in the panel or in `dossiers/<id>.md`.

## Notes

This is **agent-only** work: the watch-loop deliberately skips `deepdive` requests and leaves them for a
Claude session (you). Always do it for a company you can actually research — never fabricate a dossier.
Compliance: only public business information; this is B2B lead research.

The dossier answers "who are they and why pitch them". When the redesign is already decided and the
question becomes "what exactly do we build" — full-site capture, issue register, implementation plan —
hand over to **`prospect-blueprint`** (it builds on this dossier; don't duplicate its work here).
