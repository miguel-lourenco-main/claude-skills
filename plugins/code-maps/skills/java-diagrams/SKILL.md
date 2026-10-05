---
name: java-diagrams
description: >
  Build correct class diagrams and package (module) diagrams for a Java codebase, as one
  navigable HTML page plus optional Graphviz DOT files. Use whenever asked for a "class diagram",
  "UML", "package diagram", "module diagram", "dependency diagram", "architecture diagram of the
  code", "how do these classes relate", or "map of the codebase" for a Java, Spring Boot, Maven
  or Gradle project. Relationships are read from compiled bytecode and cross-checked against
  jdeps, every drawing is verified against the extracted graph before it is written, and large
  codebases are split into bounded views instead of one unreadable picture. Do NOT hand-draw
  Mermaid or PlantUML class diagrams of real Java code from reading the source — use this.
  NOT for what happens when the program runs (which step calls what, in which order, with which
  data) — that is code-maps:execution-trace. Not for non-Java code or database schemas.
---

# Java diagrams

A diagram drawn by reading source and writing arrows from memory misses relationships and
invents others. This skill never lets you write an arrow. A program reads the class files, a
second program (jdeps) confirms nothing was missed, a third lays the views out and proves each
one accounts for every relationship in its scope. Your job is to point it at the right classes,
read what it reports, and explain the result.

## Run it

Requirements: a JDK 24+ on PATH (only to run the tool; the project may target any Java
version), Node 18+, and the project's **compiled** classes.

```bash
# 0. where the skill lives: the plugin, or a personal copy
SK="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/java-diagrams}"
[ -d "$SK" ] || SK="$HOME/.claude/skills/java-diagrams"
ls "$SK/scripts/run.mjs" || echo "skill scripts NOT FOUND"

# 1. compile, so the class files match the source
cd <project> && ./mvnw -q compile          # Gradle: ./gradlew classes

# 2. one command: extract -> jdeps cross-check -> build + verify -> measure in Chrome
node "$SK/scripts/run.mjs" \
  --classes target/classes \
  --out <output-dir>/<project>.html --title "<project>"
```

The first run installs Graphviz (wasm) with npm into `~/.cache/claude-code-maps/java-diagrams`
(`JAVA_DIAGRAMS_DEPS` moves it). Nothing is written into the skill's own folder.

- Maven puts classes in `target/classes`, Gradle in `build/classes/java/main`. A multi-module
  build has one such directory per module: pass `--classes` once for each. A jar works too.
- Tests are left out unless asked for: `--classes target/test-classes=test --sets main,test`.
- `--dot-dir <dir>` also writes one `.dot` file per package and class view (diagram as code).
- `--notes notes.json` adds one-line package descriptions (see below).
- Write output where the user asked, otherwise to the scratchpad. Do not put generated files in
  the repository unasked.

The run stops, and writes no page, if: the classes are older than the sources, jdeps reports a
dependency the extractor lacks, or any view fails verification. Fix the cause; never work
around a stop by drawing something yourself.

## What you get

One HTML file (self-contained, works offline, valid as an Artifact) with three levels:

| View | Shows | Bound |
|---|---|---|
| Packages | sub-packages of one package and the dependencies between them, counted | 30 boxes |
| Classes | the classes declared in one package, UML notation, members when there are few | 25 boxes |
| Focus | one class and everything it touches or is touched by | 30 neighbours |

There is deliberately no whole-codebase class diagram. Past a few dozen boxes nobody can read
one, and that is the failure this skill replaces. Navigation does the job instead: click a
package to descend, a class to focus, an arrow to list exactly which relationships it stands
for with the member and source line of each. Every package view also has a Matrix tab, which
stays readable when the arrows do not.

How a view stays within its bound without dropping anything — these are the only reductions,
and the page states which ones a view used:

1. **Nested types fold into their top-level class.** A relation that belongs to a nested type
   is never shown as the outer class's own inheritance or field; it is drawn as a dependency
   labelled with the nested type.
2. **Outside packages connect to the frame.** An arrow from outside to the package frame means
   "to the package as a whole"; open the arrow to see the individual pairs.
3. **Identical connections stack.** When a view is over its bound, boxes with exactly the same
   connections become one stack ("98 packages with the same connections").
4. **The lightest are folded** into one "N more" box if it still does not fit.
5. **Between packages, an arrow already implied by a path of stronger arrows is drawn faint.**
   Still drawn, still counted.

## Read the report before you say anything

`run.mjs` prints, and `<out>.verify.json` records:

- **jdeps cross-check** — "in jdeps but not in graph" must be 0. A handful "seen only by the
  extractor" is normal (local variable types and annotations jdeps skips).
- **verification** — every view accounts for every in-scope relationship; every node and arrow
  is present in the SVG and joined to the right ends; no arrow claims a kind the bytecode does
  not show.
- **relationships drawn as their own arrow somewhere** — normally nearly all. The remainder are
  pairs whose two ends are both hubs; they are counted inside aggregated arrows and listed in
  the report. Say the number.
- **browser check** — no text spilling out of a box, no script errors. If Chrome is missing the
  step is skipped; say that legibility was not measured.

Report those numbers to the user as they are. If a step was skipped, say so.

## What the arrows mean, and what bytecode cannot tell you

| Arrow | Meaning | Evidence |
|---|---|---|
| solid, hollow triangle | extends | class header |
| dashed, hollow triangle | implements | class header |
| solid blue, open head, field name | holds it in a field; `*` in a collection or array, `0..1` in an `Optional` | field signature |
| dashed grey, open head | uses: creates, calls, reads, takes as parameter, returns, throws, annotated with | method signatures and instructions |
| thick grey with a number | several relationships between two boxes | the pairs it covers |
| orange | the two ends depend on each other (a cycle of length two) | both directions exist |

Be straight about the limits when the user's question touches them:

- **Composition vs aggregation is not decidable** from code, so the diagram draws a plain
  association and never a diamond. Do not add diamonds by hand.
- **Spring wiring.** A class that injects an interface is linked to the interface, not to the
  implementation the container picks at run time. The implementers are one click away (focus
  the interface). `@Bean` factory methods show as "creates"/"returns" on the configuration
  class.
- **Reflection, `Class.forName`, service loaders, config-driven wiring** leave no reference in
  bytecode and are not drawn.
- **Compile-time constants** are inlined by javac: a class that only reads another's
  `static final` primitive or String keeps no reference to it.
- **Lombok and other generators**: generated members appear, because bytecode is what is read.
- Source-retention annotations are gone before bytecode and do not appear.

## Your part: scope and words, never arrows

- Choose which class roots and sets to include, and tell the user what you left out.
- Optionally write `notes.json` with one sentence per package, taken from the code or its
  docs, to show in the side panel:
  `{"packages": {"com.acme.billing": "Invoices and payment reconciliation."}}`
- When the user asks a question ("what depends on X?", "show me the rules package"), build the
  page and send them to the right view: the page deep-links with `#p.<package>` (packages),
  `#c.<package>` (classes) and `#u.<fully.qualified.Class>` (focus).
- To publish as an Artifact, publish the generated `.html` as is.
- If the user wants a diagram inside a document, use the `.dot` files from `--dot-dir`, or
  screenshot a view. Do not retype a view into Mermaid: that reintroduces the hand-drawn step.

If a diagram looks wrong, the fix is in `scripts/` (and must keep verification passing), not in
an edited output file.

## Files

- `scripts/run.mjs` — the whole chain, with the prerequisite and staleness checks.
- `scripts/Extract.java` — class files → `graph.json` (types, members, and every type-to-type
  reference with its kind, member and line). JDK `java.lang.classfile`, no dependencies.
- `scripts/crosscheck.mjs` — compares the graph's pairs with `jdeps -verbose:class -filter:none`.
- `scripts/model.mjs` — graph → bounded views → DOT. The reduction rules and the size caps
  (`CAPS`) live here.
- `scripts/build.mjs` — lays out with Graphviz (wasm), verifies, writes the page.
  `scripts/template.html` is the page. `scripts/deps.mjs` finds or installs Graphviz.
- `scripts/check-render.mjs` — headless-Chrome measurement of the built page.
- `research/` — the survey this design came from: existing skills and tools, extractors,
  renderers and readability techniques.
