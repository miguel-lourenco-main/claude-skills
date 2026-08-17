---
name: ui-adversary
description: Spawn an adversarial agent that critiques a live web UI/UX in the browser — it walks the running app with full browser tooling (multi-viewport screenshots, GIF recordings of interactions, accessibility tree, console/network logs, keyboard-only passes, JS measurement probes for contrast/tap-targets/overflow) and returns a severity-ranked findings report where every claim carries captured evidence. Use when the user says "critique this UI", "roast my site/app", "adversarial review of the UI", "what's wrong with this page", "be brutal about my design", "find the UX problems", or wants a hostile second opinion on something they built before shipping it. Read-only on the app — it judges, it never fixes. NOT for making the fixes or designing improvements (use impeccable / ui-ux-director), NOT for studying someone else's product for inspiration (use product-teardown), and NOT for static code review of an app that isn't running.
---

# UI adversary

A critique you write yourself is soft: you know what everything means, so you cannot see it
cold. This skill spawns a **separate adversarial agent** with no stake in the work, briefs it
to attack a live UI through real browser tooling, and relays its severity-ranked report. The
core contract: **no evidence, no finding** — every claim is backed by a screenshot, recording,
measurement, or log line the agent actually captured.

## 0 · Preflight — a live page and a connected browser

```bash
AD="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/ui-adversary}"
[ -d "$AD" ] || AD="$HOME/.claude/skills/ui-adversary"
ls "$AD/references/agent-briefing.md" || echo "briefing NOT FOUND"
```

The target must be reachable in Chrome: a deployed URL, or the local dev server (start the
app first — via the project's run skill/commands if it has one). Verify the claude-in-chrome
tools connect (`tabs_context_mcp`) **before** spawning; if the browser is unavailable, say so
and offer the degraded mode — a static markup/CSS review clearly labeled "not a live critique,
rendering and interaction unverified" — instead of dying.

## 1 · Scope the attack with the user

Three questions, defaulted if the user has no preference:

- **Target**: which URL(s)? (default: the app this session is building, root page)
- **Flows**: which journeys matter? (default: walk every reachable main surface + one
  form/action if present)
- **Depth**: quick pass (~10 min, top surfaces, no recordings) or full audit (all
  viewports, GIFs, every probe)? (default: full)

## 2 · Spawn the adversary

Launch **one** agent (`general-purpose`, background). Its prompt = the briefing template in
`references/agent-briefing.md` with the scope filled in. The briefing carries the whole
method — personas, viewport matrix, the probe cookbook with runnable JS, the evidence rule,
and the report format — so the agent needs nothing from this conversation's context. That
separation is the point: the adversary judges only what it can see, like a real first-time
user.

While it runs, do other work. Do not pre-announce findings.

## 3 · Relay the verdict, verify the wild claims

The agent's report is the deliverable — relay it whole, ranked P0→P3, with its evidence
paths. Before presenting:

- Spot-check any finding that would be embarrassing if wrong (a claimed broken flow, a
  claimed contrast failure) by reopening the page yourself — **at most one** verification
  round; do not re-litigate the whole report.
- Keep the agent's "what already works" section — a critique with no positives reads as
  noise and gets ignored.

Evidence screenshots/GIFs live in the session scratchpad (the agent saves with
`save_to_disk`). On request, save the report to `<project>/ui-critiques/<slug>-<date>.md` —
never write into the app's source tree.

## 4 · Hand off, don't fix

This skill ends at the verdict. When the user wants the problems fixed, that is impeccable /
ui-ux-director territory (or plain editing) — start from the report's P0s. If the user wants
a second round after fixing, spawn a **fresh** adversary scoped to the previously-failing
surfaces; do not reuse the first agent, whose context is now anchored to the old state.
