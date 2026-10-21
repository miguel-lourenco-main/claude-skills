# code-maps

Maps of a codebase as navigable HTML pages. Both skills share one rule: **nothing on the
page is drawn from memory.** Structure is read from compiled bytecode, behaviour from one
real run, code from the source at build time — and each build checks itself before it
writes a page.

## Skills

- **java-diagrams** — class diagrams and package diagrams for a Java codebase, as one
  navigable page: relationships read from bytecode and cross-checked against jdeps, every
  drawing verified against the extracted graph, large codebases split into bounded views.
- **execution-trace** — a run trace: one execution followed from the command line to its
  last effect, step by step like a debugger, redrawn through layers (process, code, state,
  data, disk); one phrase per box, an in-depth explanation behind each.
- **flow-diagram** — a data-and-execution-flow diagram of one process on every path: threads,
  loops as nested frames with their back edges and exits, decisions in the code's own
  expressions, and beside them what each step reads, writes and talks to; rendered from a
  JSON spec by a builder that refuses a misleading one.

Use `java-diagrams` for *what exists and how it is connected*, `execution-trace` for *what
happened in one run, with its figures*, and `flow-diagram` for *how the process runs on every
path: its loops, its exits, and the data each step touches*.

## What is in each

| Path | What it is |
|---|---|
| `skills/java-diagrams/SKILL.md` | how to run it, how to read its report, what bytecode cannot tell |
| `skills/java-diagrams/scripts/run.mjs` | the whole chain: extract → jdeps cross-check → build + verify → measure in Chrome |
| `skills/java-diagrams/scripts/` | `Extract.java` (class files → graph), `model.mjs` (bounded views), `build.mjs` + `template.html` (the page), `deps.mjs` (Graphviz, installed once into `~/.cache/claude-code-maps/`) |
| `skills/java-diagrams/research/` | the survey the design came from |
| `skills/execution-trace/SKILL.md` | the workflow: choose the run, read it, list steps and phases, write the builder, build, check, report |
| `skills/execution-trace/templates/build_trace.py` | the per-project builder, to copy and fill |
| `skills/execution-trace/scripts/tracekit.py` | anchored excerpts, bytecode call graph, lens builders, validation, page writer |
| `skills/execution-trace/scripts/classload.py` | measures which classes one run loads |
| `skills/execution-trace/scripts/check-page.mjs` | opens every step in every layer in headless Chrome |
| `skills/execution-trace/assets/page.html` | the page: draws any valid trace data |
| `skills/execution-trace/references/` | the data format, and the content rules with the two-agent reading |
| `skills/flow-diagram/SKILL.md` | the workflow: fix the process, read its control flow and its data, write the spec, build, look once |
| `skills/flow-diagram/scripts/flowdiagram.py` | spec → validated layout → one self-contained HTML page |
| `skills/flow-diagram/examples/extract-catalogue.json` | the reference diagram the skill was made from |
| `skills/flow-diagram/references/` | what defines this kind of diagram against its neighbours, and the spec format |

## Requirements

- `java-diagrams`: JDK 24+ to run the extractor (the project may target any version), Node 18+.
- `flow-diagram`: Python 3.8+ (standard library); Chrome optional, for the one look.
- `execution-trace`: Python 3.9+; for the Code layer a JDK (`javap`) and compiled classes;
  Node 22+ and Chrome for the page check. The built page loads dagre from cdnjs.

## Where it came from

Both were built while documenting one Spring Boot project, and each rule in them answers a
mistake made there: a class view with arrows in listing order, a start-up drawing that named
5 classes where 66 belonged, a sentence about who approved what that the data did not
support. `execution-trace/references/content-rules.md` keeps that list.

## Scope

The Code layer of `execution-trace` and all of `java-diagrams` are JVM-only. The other
layers of a run trace work for any language, since they are written from the run's files.

If `~/.claude/skills/java-diagrams` exists from before this plugin, it is the same skill:
remove the personal copy once the plugin is enabled, or both will be listed.
