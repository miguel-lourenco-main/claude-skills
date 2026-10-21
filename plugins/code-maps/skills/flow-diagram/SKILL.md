---
name: flow-diagram
description: >
  Draw a data-and-execution-flow diagram of one process as its code executes it: the threads,
  the loops as nested frames with their back edges and exits, the decisions labelled with the
  code's own expressions, and beside them a table of what each step reads, writes and talks
  to. One HTML page, rendered by a script from a JSON spec, so every diagram of this kind has
  the same grid and the same conventions. Use when the user asks for a "diagrama de dados e
  fluxo de execução", "fluxo de execução", "diagrama de nível 0 do fluxo", "onde está o loop",
  "data and execution flow diagram", "how does the process run, with its loops", or "a diagram
  faithful to how the code executes". NOT for one real run with its figures (use
  code-maps:execution-trace), not for which classes exist and depend on which (use
  code-maps:java-diagrams), and not a hand-drawn level-0 DFD with data arrows between steps.
---

# Flow diagram

A diagram drawn from how pipelines usually look turns the code into a conveyor belt. That
was the first, rejected version of this diagram: its owner asked "where is the loop of the
chain?". This skill draws what the code executes: the loops it runs, the decisions that leave
them, and the shared state each step touches.

You read the code and write a JSON spec. `scripts/flowdiagram.py` lays it out and refuses a
spec that would mislead. Read `references/what-this-diagram-is.md` once before the first
diagram: it lists the eight traits that define this kind, and the neighbours it must not drift
into.

**Read-only.** The skill reads the repository and writes two files: the spec and the page
(section 5). It runs nothing of the project's.

## 0 · Resolve paths

```bash
SK="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/flow-diagram}"
[ -d "$SK" ] || SK="$HOME/.claude/skills/flow-diagram"
ls "$SK/scripts/flowdiagram.py" "$SK/examples/extract-catalogue.json" || echo "skill files NOT FOUND"
python3 "$SK/scripts/flowdiagram.py" --check "$SK/examples/extract-catalogue.json"
```

Python 3.8+, standard library only. Chrome is optional and only used for the one look in
section 6.

## 1 · Fix the process and its two ends

Agree with the user, in one question at most, on three things:
- which process to draw;
- where it starts: the entry point, such as the controller, the CLI command or the scheduled
  job;
- where it ends: the last effect, such as the run closed or the file written.

If the code has no loop on that path, this is not the diagram: say so, and offer a numbered
list.

## 2 · Read the control flow from the code

Follow the calls from the entry point. For each method on the path, note the following, using
names exactly as written in the code:

- **Threads and handoffs:** `submit`, `@Async`, a queue. Each one becomes a `thread` block.
  What the caller receives at that moment (a 202, a 400) becomes `returns` or `refuse`.
- **Every loop statement:** what it iterates, and in which order. A loop inside a method
  called from a loop becomes a loop inside a loop.
- **Every way out of each turn:**
  - `continue` becomes `back`, or `branch: next`;
  - `break` or `return` becomes `branch: exit`;
  - an exception that is caught and turned into a status goes in the sub-line of the node
    that catches it.
- **The step order:** from the process definition (YAML, a table) when the steps are data.
  Cite the revision.
- **The per-step error policy** (`onError`), because it decides which exits happen.

Level 0 keeps the orchestration calls only. A helper that changes neither the path nor the
data stays out.

## 3 · Read the data each step touches

Draw the data the way the code moves it:
- **When steps share a context or blackboard**, grep each step class for its reads and writes
  and put them in a table, in the code's own names. Never draw arrows between the steps.
  ```bash
  for f in <steps-dir>/*.java; do echo "$(basename $f .java)"; grep -oE "(require|find|put)\(\w+\.\w+" "$f" | sort -u; done
  ```
- **External I/O:** take it from the constructor dependencies that are repositories, clients or
  stores. Mark each `←` read, `→` write, or `⇄` both. List the remaining dependencies in
  `uses`.
- **When data is passed as arguments**, it goes on the arrow (`in`), not in a table.

## 4 · Write the spec

Copy `examples/extract-catalogue.json` and replace its content. The keys are documented in
`references/spec-format.md`. Keep to the code's names in titles, decision expressions and
slots. End with an `evidence` line naming the methods and files everything was read from.

## 5 · Build

Write the spec and the page where the user asked. Otherwise put them in the scratchpad, or in
the user's outputs folder when their instructions name one. Never write them into the
repository unasked.

```bash
python3 "$SK/scripts/flowdiagram.py" <dir>/<name>.flow.json <dir>/<name>.html
```

A refusal (exit 1) says what to change in the spec: a loop with no way back, a decision with
one path, a label too wide. Fix the spec, never the generated page. Allow at most three
rounds; if it still refuses, report the message.

## 6 · Look once, then publish

Take one screenshot of the page, if Chrome is available:

```bash
(echo '<!doctype html><meta charset="utf-8">'; cat <dir>/<name>.html) > /tmp/flow-preview.html
google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1320,1900 \
  --screenshot=/tmp/flow.png file:///tmp/flow-preview.html
```

Check four things against the code:
- every loop is where the code loops;
- every exit lands where control lands;
- every step's row matches its class;
- nothing overlaps.

Fix overlaps in the spec, for example with shorter lines or a split cell. Allow one round of
fixes and no second look.

If Chrome is missing, say the page was not looked at. Publish the `.html` as an Artifact as
it is, when the user wants a link.

## 7 · Report

Say what was drawn:
- the loops and their nesting;
- the number of steps;
- which reads and writes came from a grep, and which were read by hand;
- what was left out at level 0;
- whether the page was looked at.

## Files

- `scripts/flowdiagram.py` — spec → validated layout → one self-contained HTML page (`--check` validates only; `--svg` also writes the bare SVG).
- `examples/extract-catalogue.json` — the reference diagram: a request thread, a worker pool, an orchestrator loop, a chain loop, a process-grain loop, two data tables.
- `references/what-this-diagram-is.md` — the eight traits, and how this differs from a DFD, a flowchart, an activity, sequence or class diagram and an execution trace.
- `references/spec-format.md` — every key of the spec, and everything the builder refuses.
