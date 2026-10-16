---
name: architecture-map
description: >
  Draw a Java codebase at the three granularities an architecture review needs — a layered
  component picture with external systems (tier 1), a curated class map with the members that
  matter (tier 2), and the full class detail with packages that open and close (tier 3) — as
  single-file HTML pages that are also the editor: open one, drop in the graph and a map
  document, move boxes, write the words, save the document. Use when asked for an "architecture
  diagram", "component diagram", "layered view", "C4-style picture", "which classes make up each
  component", "a class map we can edit", "the editor for the code maps", or to turn a hand-drawn
  architecture slide into something the code can confirm. Every arrow between code boxes is
  aggregated from bytecode (code-maps:java-diagrams extracts it) and accounted for; a person
  writes only membership, layers and words. NOT for a one-off UML of a few classes with no
  editing (java-diagrams does that alone), not for what happens at run time (execution-trace).
---

# Architecture map

A component diagram drawn from memory puts arrows where the author believes them to be. This
skill never lets anyone write an arrow between two code boxes. `java-diagrams` reads the class
files and cross-checks them against jdeps; the projector here folds those relations onto
whatever boxes a person declared — components, packages, groups, classes — and proves that every
relation between the classes on the page is covered by exactly one arrow. What a person
writes is **membership** (which classes a box stands for), **layers**, **words**, and, for
things outside the code (a site, a database, a front end), **declared** arrows that are drawn
in their own style and carry no evidence.

Four tiers, one document format, one page (tier 0 is a draw.io file instead):

| Tier | Boxes | Default size | Comes from |
|---|---|---|---|
| 0 sketch | the whiteboard picture, with flow: bands of named boxes (a cyan band is a part of the system, an orange box a concrete piece, an outlined box a contract), the chain order read from the process file as cyan arrows, the bytecode relations as grey arrows; names only, no counts, no words; boxes are sets of classes (the system picture) or single classes (the flow in code terms); written as draw.io XML (+ an SVG twin) for editing in draw.io | 15–60 | a person (or you) writes the boxes and names the process file (`meta.process`); `drawio.mjs` draws it |
| 1 architecture | components, actors, planned boxes, in layers; nesting allowed | 15–40 | a person (or you) writes the components; `--seed tier1` gives one per package to start |
| 2 curated classes | ~7 groups of ~10 classes each with phrase, key fields and methods; stacks for families | ~65 classes | a person (or you) picks the classes; `--seed tier2` lists the most connected |
| 3 full detail | every package as a box that opens to its classes; stacks and "N more" when a package is too big | all classes | `--seed tier3`, complete by construction |

## Run it

Requirements: JDK 24+ and Node 22+ (for the browser check also Chrome), and the project's
**compiled** classes.

```bash
SK="$CLAUDE_PLUGIN_ROOT/skills/architecture-map"
node -e "import('$SK/../java-diagrams/scripts/model.mjs').then(m => { if (!m.assemble) throw 1 })" || echo "code-maps plugin out of date: update it"

cd <project> && ./mvnw -q compile                       # Gradle: ./gradlew classes

# 1. the graph (jdeps cross-check included); nothing else reads class files
node "$SK/../java-diagrams/scripts/run.mjs" --classes target/classes --graph-only --graph <dir>/graph.json

# 2. a starting document per tier, then the words and membership (see below)
node "$SK/scripts/map.mjs" --graph <dir>/graph.json --seed tier1 --map-out <dir>/architecture.map.json --lang en

# 3. project + verify, pack the page, check it in Chrome — for every document at once
node "$SK/scripts/tiers.mjs" --graph <dir>/graph.json \
  --map <dir>/architecture.map.json --map <dir>/class-map.map.json --map <dir>/code-detail.map.json \
  --out-dir <dir>/dist [--sources src/main/java] [--docs class-docs.json] [--shots <dir>/shots]
```

`tiers.mjs` writes, per document, `<name>.html` (the page, self-contained, valid as an Artifact; a tier-0 document gives `<name>.drawio` + `<name>.svg` instead),
(`scripts/drawio-drive.mjs <name>.drawio <shots-dir> fit shot=fit zoom=100 center=<Box> shot=<name> drag=<Box>,0,80 undo lines console` opens that file in draw.io itself, headless, and is how a review of it is done — it needs the network),
`<name>.resolved.json` (the document plus everything the graph adds), `<name>.verify.json`
(the report) and `<name>.reading.md` (a plain-text reading for a reviewer without a browser).
The first run installs ELK (the layout engine) with npm into `~/.cache/claude-code-maps/architecture-map`.

The run stops, and writes no page, when: the classes are older than the sources, jdeps knows a
relation the extractor lacks, the document is refused (`map.mjs` exit 2 — a declared arrow
between two code boxes, a class claimed by two boxes, a selector that matches nothing, words on
an arrow that does not exist, evidence fields typed by hand), the graph changed since the words
were written (exit 3 — re-run with `--accept-graph` once you have checked them, `--write-map`
to record the new graph), or a state of the page fails accounting (exit 1). Fix the cause.

## The editor

The same page is the editor. Open any built page and press **Edit**, or open a blank one
(`node scripts/pack.mjs --out editor.html`) and drop `graph.json` and a `.map.json` on it. In
edit mode a box can be dragged (its position is kept in the document, relative to its parent),
moved into another group, renamed, given a phrase, note, layer, shape, key members or a members
selector; arrows get their words, or a reason not to draw them; actors and declared arrows can be
added; layers created and reordered. **Save** writes the document back where it came from
(Chrome, File System Access) or downloads it. Every edit is projected and accounted for on the
spot: a document that fails stays on screen with the reason, and Ctrl+Z undoes it. The page
never writes a `.resolved.json` or `.html`: that is `tiers.mjs`, run again on the saved document.

## Your part: membership and words, never arrows

1. **Tier 1.** Seed it, then read `hints` (classes per package, annotations, what each package
   uses most, classes that touch external types), the project's own docs, and any picture the
   team drew. Write the layers in flow order, one component per thing the team names, nested
   where the picture nests, `members` by selector where the code defines the family (`pkg`,
   `implements`, `annotated`) and by explicit `units` only for judgement calls. Add `actor` boxes
   (`shape: system | person | store`) for what lives outside the code, `planned: true` on boxes
   that are not built, and `declared` arrows to and from those. Delete `hints` when done.
2. **Run `map.mjs`.** For every unowned class the report lists, either assign it or leave it out
   and say so. Keep the default view within 15–40 boxes. Fix every refusal at its cause.
3. **Tier 2.** From `hints.mostConnected`, `entries` and `families`, pick ~65 classes in ~7
   groups that follow the flow of a run; put each family behind a `stack` with its selector; one
   phrase per class, taken from its Javadoc or code; `keys` only where the automatic pick is
   wrong. Then, for every drawn arrow the report lists as missing words, write a `label` (3–4
   words) and a `desc` (one sentence) in `edges.derived` — words on an arrow that already exists,
   nothing more. `meta.requireWords: true` makes a wordless arrow a failure.
4. **Tier 3.** Seed, project, and change only which packages start closed and their phrases.
5. **Present.** Publish each page as an Artifact unchanged. Report the numbers as printed: the
   graph (classes, relations, jdeps missed and extra); per tier the boxes, relations in scope and
   whether every state is accounted for, arrows drawn and listed with their reasons, declared
   arrows, unowned classes, words missing; the browser check (overflow, script errors, layout
   time) or that it was skipped; which `.map.json` files you wrote and where.

What you must not do: type a derived arrow (`from`/`to`/`rel`) or any evidence; declare an arrow
between two code boxes; invent a class id or guess a membership from memory; edit a
`.resolved.json` or a built `.html`; use `--prune-words` or `--accept-graph` without telling the
user what changed; write a phrase the code or its docs do not support; retype a view as Mermaid.

## Reading the page

Boxes: a component or package opens in place (click its header) and shows its own classes as one
box plus its children; a stack is several classes with one role drawn once; an alias is a class
that belongs to another group, drawn here because this group uses it; an actor is outside the
code; a planned box is dimmed. Arrows: solid with a hollow triangle is `extends`, dashed with a
triangle `implements`, solid in the accent colour with the field name is `field`, dashed grey
`uses`, faint `named in a signature only`, thicker with a count several relations at once, orange
both ways, dash-dot in the actor colour declared. The panel on the right says what an arrow
means in words and lists the evidence (relation kind, member, line, count); an arrow that is
listed but not drawn says why (implied by other arrows, between non-adjacent layers, hidden by
the author with a reason, a quiet class, a group that draws only inheritance). The status bar
is the proof line: relations in the graph, in scope, all accounted for, drawn, listed, declared.

Files: `references/map-format.md` is the document schema; `references/authoring.md` the
selector cookbook and the word rules. Scripts: `map.mjs` (project + verify, seeds), `core.mjs`
(the projector, shared with the page), `pack.mjs` (the page), `check-map.mjs` (Chrome),
`reading.mjs` (text), `tiers.mjs` (all of it), `deps.mjs` (ELK).
