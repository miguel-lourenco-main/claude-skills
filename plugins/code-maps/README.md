# code-maps

Maps of a codebase as navigable HTML pages. Both skills share one rule: **nothing on the
page is drawn from memory.** Structure is read from compiled bytecode, behaviour from one
real run, code from the source at build time — and each build checks itself before it
writes a page.

## Skills

- **java-diagrams** — class diagrams and package diagrams for a Java codebase, as one
  navigable page: relationships read from bytecode and cross-checked against jdeps, every
  drawing verified against the extracted graph, large codebases split into bounded views.
- **architecture-map** — the same graph at the three granularities a review needs: a layered
  whiteboard sketch with the chain's flow as a draw.io file (tier 0), a component picture with external systems (tier 1), a curated class map with the members that
  matter (tier 2), the full detail with packages that open and close (tier 3). One document
  format, one single-file page that is also the editor: a person writes membership, layers and
  words; every arrow between code boxes is aggregated from the bytecode and accounted for.
- **execution-trace** — a run trace: one execution followed from the command line to its
  last effect, step by step like a debugger, redrawn through layers (process, code, state,
  data, disk); one phrase per box, an in-depth explanation behind each.

Use `java-diagrams` for *what exists and how it is connected*, `architecture-map` for *how it
is organised, in the team's words, each box accounted against the bytecode*, `execution-trace`
for *what happens, in which order, with which data*.

## What is in each

| Path | What it is |
|---|---|
| `skills/java-diagrams/SKILL.md` | how to run it, how to read its report, what bytecode cannot tell |
| `skills/java-diagrams/scripts/run.mjs` | the whole chain: extract → jdeps cross-check → build + verify → measure in Chrome |
| `skills/java-diagrams/scripts/` | `Extract.java` (class files → graph), `model.mjs` (bounded views), `build.mjs` + `template.html` (the page), `deps.mjs` (Graphviz, installed once into `~/.cache/claude-code-maps/`) |
| `skills/java-diagrams/research/` | the survey the design came from |
| `skills/architecture-map/SKILL.md` | the three tiers, the editor, what a person writes (membership, words) and never writes (arrows) |
| `skills/architecture-map/scripts/tiers.mjs` | the whole chain per document: graph → project + verify → pack → check in Chrome |
| `skills/architecture-map/scripts/` | `core.mjs` (the projector, shared with the page), `map.mjs` (verify, seeds), `pack.mjs` (the page), `check-map.mjs`, `reading.mjs`, `deps.mjs` (ELK, installed once into `~/.cache/claude-code-maps/`) |
| `skills/architecture-map/assets/map-editor.html` | the page: viewer with the data embedded, editor when files are dropped on it |
| `skills/architecture-map/references/` | the document format; the authoring cookbook (selectors, words, what the report asks of you) |
| `skills/architecture-map/tests/` | hermetic tests (`node --test tests/*.test.mjs`): a hand-made graph, the projector, the CLI's exit codes |
| `skills/execution-trace/SKILL.md` | the workflow: choose the run, read it, list steps and phases, write the builder, build, check, report |
| `skills/execution-trace/templates/build_trace.py` | the per-project builder, to copy and fill |
| `skills/execution-trace/scripts/tracekit.py` | anchored excerpts, bytecode call graph, lens builders, validation, page writer |
| `skills/execution-trace/scripts/classload.py` | measures which classes one run loads |
| `skills/execution-trace/scripts/check-page.mjs` | opens every step in every layer in headless Chrome |
| `skills/execution-trace/assets/page.html` | the page: draws any valid trace data |
| `skills/execution-trace/references/` | the data format, and the content rules with the two-agent reading |

## Requirements

- `java-diagrams`: JDK 24+ to run the extractor (the project may target any version), Node 18+.
- `architecture-map`: the same, plus Node 22+ and Chrome for the page check; the page itself
  needs a browser with `DecompressionStream` (Chrome 80+, Firefox 113+, Safari 16.4+) and saves
  in place only in Chromium (File System Access), elsewhere it downloads.
- `execution-trace`: Python 3.9+; for the Code layer a JDK (`javap`) and compiled classes;
  Node 22+ and Chrome for the page check. The built page loads dagre from cdnjs.

## Where it came from

Both were built while documenting one Spring Boot project, and each rule in them answers a
mistake made there: a class view with arrows in listing order, a start-up drawing that named
5 classes where 66 belonged, a sentence about who approved what that the data did not
support. `execution-trace/references/content-rules.md` keeps that list.

## Scope

The Code layer of `execution-trace`, all of `java-diagrams` and all of `architecture-map` are JVM-only. The other
layers of a run trace work for any language, since they are written from the run's files.

If `~/.claude/skills/java-diagrams` exists from before this plugin, it is the same skill:
remove the personal copy once the plugin is enabled, or both will be listed.
