# Architecture

<!-- genesis: describe ONLY what exists after Phase 3 scaffolding — never planned modules,
never scaling plans. Write this by looking at the actual files. If a section would be empty at
this stage (e.g. Data flow in a static site), keep the heading with one honest line. -->

## Stack

<!-- genesis: one line per major choice with a one-line why, e.g.
"- FastAPI + uv — user knows Python; async-friendly for the SSE endpoint (see DECISIONS 0001)". -->
{{stack}}

## Module map

<!-- genesis: table of top-level directories/modules that EXIST. "Read before changing" points
to a doc section or file a session should read first — leave "—" when nothing applies. -->
| Path | Responsibility | Read before changing |
|---|---|---|
{{module-rows}}

## Data flow

<!-- genesis: how a request/interaction moves through the system, in prose or a short arrow
sketch. At scaffold time this is usually 2-4 lines. -->
{{data-flow}}

## Entry points

<!-- genesis: where execution starts — main file, route registration, CLI entry, build entry. -->
{{entry-points}}

## Where changes go

<!-- genesis: routing table for future work, e.g. "Adding an API route → src/routes/, register
in src/app.ts". One line per common change type. This section pays for the whole file. -->
{{where-changes-go}}
