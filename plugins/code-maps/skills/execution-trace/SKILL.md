---
name: execution-trace
description: Build a run trace — one navigable HTML page that follows a single execution of a program from the command line to its last effect, step by step, like a debugger. Every step can be redrawn through layers (process, code, state, data, disk), for the whole run or one step at a time; each box carries one phrase and opens an in-depth explanation. Code excerpts are cut from the source at build time, class-to-class arrows are read from compiled bytecode, and the classes drawn are the ones a measured run really loaded. Use when the user says "show me the execution flow", "what happens when the app runs", "walk me through the pipeline step by step", "trace a run from start to save", "explain the flow like a debugger", "an artifact of how the process executes", or wants to present how a system works to someone else. NOT for the static structure of the code (which classes exist and how they relate — use code-maps:java-diagrams), and not a profiler: it explains one run, it does not time it.
---

# Execution trace

A flow explained from memory states things the code does not do. This skill makes the page
out of the run itself: you choose one real execution, read what it left behind, and write
only the reading of it. The page is the same for every project; what changes is one builder
script that lives in the project and can be re-run when the code moves.

The Code layer is measured for **JVM projects** (bytecode + class loading). For another
language, build the other layers and leave Code out, or feed it a call graph from that
language's own tooling in the same shape — never arrows drawn from reading the source.

**Read-only by default.** Sections 1 to 3 read the repository and run the program once in a
mode that writes nothing that matters. The only files written are the ones named in section 4,
inside the project, where the user agreed. Publishing is section 7 and is asked for.

## 0 · Resolve paths

```bash
SK="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/execution-trace}"
[ -d "$SK" ] || SK="$HOME/.claude/skills/execution-trace"
ls "$SK/scripts/tracekit.py" "$SK/assets/page.html" "$SK/templates/build_trace.py" || echo "skill files NOT FOUND"
python3 "$SK/scripts/tracekit.py" selftest
command -v javap >/dev/null || echo "no javap: the Code layer cannot be read from bytecode — leave it out and say so"
```

## 1 · Choose the run

The page shows **one** execution, not the program in general. Settle with the user, in one
round of questions at most:

- **The command**, exactly as someone would type it.
- **The subject**: the one example whose figures appear (a customer, a target, a file). Pick
  one where the interesting branches actually fire; say on the page what was borrowed from
  another example when the chosen one has nothing to show for a step.
- **Where the flow ends.** If the user expects an ending the code does not have ("saved in
  the database"), search for it. If nothing does it, the page ends with a step drawn as
  **not built**, with the evidence of the search — not with a plausible invented step.

## 2 · Read the run before writing about it

Trace the code path from the entry point, and collect what the run left on disk (records,
snapshots, logs, exports). Every figure on the page must come out of one of those files.

Then measure which classes the JVM really loads. A walkthrough written from reading the
source misses most of them (in the project this skill came from: 5 classes named for
start-up, 66 drawn once it was measured):

```bash
python3 "$SK/scripts/classload.py" --prefix com.acme.app. --out <dir>/classload.json \
    --boot-until-output 'process running for ([\d.]+)' \
    -- java -cp "$CP" com.acme.Main <args of a run that writes nothing that matters>
```

This **executes the program**. Use a replay or dry-run mode; if there is none, ask first.
The file records its own command and is committed with the builder: it is the measurement.

## 3 · List the steps, then the phases

Write the steps in the order they run, then group them into phases. Read
`references/content-rules.md` before writing a word — it is short, and each rule in it is
there because a real reader was misled without it. The three that shape the list:

1. **A phase says who does the work.** If the program evaluates automatically and a person
   evaluates again afterwards, those are two phases, both drawn, with the loop back.
2. **One phrase per box**, verb first, 64 characters at most. The depth goes in the detail.
3. **Nothing about people, origin or intent that a file does not state.** "Accepted by a
   person" is read per item from the data, or it is not said.

## 4 · Write the project's builder

Copy the template and the kit **into the project**, so the page rebuilds there without this
skill installed. Default place: `report/run-trace/` (ask if the project has another habit).

```bash
D=<project>/report/run-trace; mkdir -p "$D"
cp "$SK/templates/build_trace.py" "$D/build_trace.py"
cp "$SK/scripts/tracekit.py" "$SK/assets/page.html" "$D/"
```

Fill `build_trace.py` top to bottom; its comments say what each part is. The data it must
produce is specified in `references/data-format.md`. Keep to the kit's readers:

- `repo.excerpt(file, anchor, n)` and `repo.call(label, file, anchor)` — never a typed line
  number or a pasted snippet. A moved anchor stops the build, which is the point.
- `lens.step_graph(entries, key_classes, …)` — the arrows are bytecode calls. A call the
  bytecode cannot show (through a framework, by reflection) goes in `declared=` **with a
  label saying why**; without one the build refuses it.
- An interface with many implementations needs a `dispatch` entry naming the ones this run
  uses, or the step's graph becomes the whole program.
- Assert the page's numbers against the run record in the builder (`assert len(rows) == 61`).

Written files: `build_trace.py`, `tracekit.py`, `page.html`, `classload.json` (the
measurement), and the generated `trace-data.json` and `dist/run-trace.html`. Generated and
hand-written files never share a path.

## 5 · Build and check

```bash
python3 "$D/build_trace.py"                              # validates, then writes data + page
node "$SK/scripts/check-page.mjs" "$D/dist/run-trace.html"   # opens every step in every layer
```

The build stops, and writes nothing, on: a missing anchor, an arrow to a box that does not
exist, a key-class arrow that is not a real call, a box with more than one phrase, a step
with no explanation. Fix the builder; never edit the generated files.

`check-page.mjs` needs Chrome and the network (the page loads its layout library from
cdnjs). Exit 2 means it could not run: say that the page was not opened in a browser.
"Nothing to draw" views are listed — each must be true, not an unfinished layer.

Fix-and-rebuild is bounded: **three rounds**. If the check still fails, report what fails.

## 6 · Read it as the listener

Open three steps you did not enjoy writing and read only what the page says. For each: can
a person who has never seen the code say what the step does, who does it, and what it
leaves? Is every sentence backed by a file? Then, if the user wants a stronger test, run
the two-agent reading in `references/content-rules.md` (one presents the page, one listens
and interrupts) — once; its findings are fixed in the builder.

## 7 · Report, then publish if asked

Report the numbers as they are: steps, layers, classes drawn per step against classes named
in the walkthrough, how many steps were not measured and why, what the check found, and
what is drawn as not built. Publish `dist/run-trace.html` as an Artifact as it is (it is a
single self-contained file) when the user asked for an artifact or a link.

## Files

- `templates/build_trace.py` — the builder to copy and fill.
- `scripts/tracekit.py` — excerpts, bytecode call graph, lens builders, validation, writer.
- `scripts/classload.py` — the class-loading measurement.
- `scripts/check-page.mjs` — headless-Chrome check of the built page.
- `assets/page.html` — the page; draws any valid data, knows no project.
- `references/data-format.md` — the data the page reads.
- `references/content-rules.md` — how to write the steps, and the two-agent reading.
