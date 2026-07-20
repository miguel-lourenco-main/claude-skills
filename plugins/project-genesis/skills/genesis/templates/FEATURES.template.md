# Features

<!-- genesis: the feature ledger — the execution surface agents build on across sessions.
The section an entry sits in IS its status; an entry MOVES between sections as work progresses
(that is current state, not history — no dates, no "moved from"). Keep entries to 1–2 lines.
Seed Planned from PRODUCT.md's confirmed v1 scope, in intended build order. -->

## In progress

<!-- genesis: the first thing a fresh session reads to resume work — keep it honest and small
(1–3 entries; if everything is "in progress", nothing is). Every entry carries a "Next:"
hand-off pointer — the immediate next step, concrete enough to act on without re-deriving it.
Format: "- **name** — what it is. Next: <step>." Empty at genesis time is normal. -->
{{in-progress-entries}}

## Planned

<!-- genesis: one line each — what it is + why it matters. Order = intended build order.
Nothing enters here that PRODUCT.md's non-goals exclude; a scope-expanding idea needs user
confirmation (and usually a DECISIONS.md entry) before it lands. -->
{{planned-entries}}

## Implemented

<!-- genesis: what the app actually does today — one line per capability, no dates and no
changelog narration (git owns the past). A feature lands here when it works end-to-end, not
when its code merely exists. Empty at genesis is normal — a minimal scaffold rarely delivers
a real capability; move an entry here only if the scaffold genuinely implemented it. -->
{{implemented-entries}}
