# What makes a flow diagram this diagram

This file is the reason the skill exists. The first version of this diagram, the one that
prompted the skill, was a classic level-0 data-flow diagram. It had the steps of a pipeline
in a column, data on the arrows between them, and stores and external systems on the sides.
Its owner looked at it and asked, **"where is the loop of the chain?"** It drew the program as
a conveyor belt. The code is two nested loops with decisions that leave them. The second
version drew what the code executes, and that is the one this skill reproduces.

The eight traits below are what changed between the two. Each one is a rule in
`scripts/flowdiagram.py` or in `SKILL.md`. A diagram that drops any of them has drifted into
one of the neighbouring kinds in the table at the end.

## The eight traits

1. **The subject is one process as the code executes it, on every path.**
   - It is not one run: no figures, no timings, no "this time it took the HOLD branch". That
     is `execution-trace`.
   - It is not the code's structure: no inheritance, no "who holds a field of whom". That is
     `java-diagrams`.
   - It is the control flow of the orchestration, from the entry point to the last effect.

2. **Loops are frames, and their nesting is the call nesting.**
   - A `for` in the orchestrator that calls a runner with its own `for` is drawn as a frame
     inside a frame, never as a straight column of boxes.
   - The frame's title names the method that loops (`Chain.run(ITEM, ctx)`), and its subtitle
     says what it iterates over and in which order.

3. **Every loop shows how it goes round and how it is left.**
   - **The back edge** is drawn and labelled with what sends control back to the top: "next
     item", or "CONTINUE, or FAIL with onError continue".
   - **Every exit** is drawn from the decision that causes it to the block where control
     lands, labelled with the condition and with what it leaves behind ("the rest: SKIPPED").
   - **A skip to the next turn** is its own edge, distinct from leaving the loop.

   The builder refuses a loop with no way back, and an exit that lands nowhere.

4. **Decisions are diamonds labelled with the code's own expression.**
   - Write `result.status` and `cancelled or aborted?`, not "is it OK?".
   - A decision has at least two outgoing paths, or it says explicitly (`either`) that both
     answers continue to the same block. This is the case of a mode switch such as series or
     lanes.

5. **Threads and early answers are visible.**
   - The point where work is handed to another thread is a dashed horizontal line with the
     handoff on the arrow (`submit`).
   - What the caller receives before the work is done (a 202, a 400 with the reason) is a
     dashed edge back to the caller. Answers run up the left rail and refusals up the right.

6. **Nodes are calls.**
   - The title is the call as written in the code (`ItemLocks.of(source:item).lockInterruptibly()`,
     `recorder.stepDone`). The sub-line says the effect that matters (what it writes, what it
     waits for).
   - Level 0 means the orchestration calls only. A helper that does not change the path or
     the data is left out.
   - The few calls that carry the work (the runner, `apply`) are emphasised.

7. **Data is separated from control, and drawn the way the code moves it.**
   - When steps communicate through a shared context, which is usually the case in a chain,
     no data arrow runs between the steps. Drawing one would claim a hand-off the code does
     not make.
   - Instead, a table beside the loop gives, per step:
     - what it reads (`require`/`find`) and writes (`put`), in the code's own slot names;
     - its I/O with outside systems, marked `←` read, `→` write, `⇄` both;
     - its error policy (`skip-target`, `continue`), because that policy changes the control
       flow.
   - When the code passes data as arguments, the argument goes on the arrow instead. Draw the
     mechanism the code uses.

8. **Everything is read from the code, and the page says where.**
   - Loops come from the loop statements and their `break`/`return`/`continue`.
   - Decisions come from the `switch`/`if` that the exits hang on.
   - The data table comes from a grep of the context accesses in each step class.
   - The order of the steps comes from the process definition.
   - The page ends with one evidence line naming those methods and files. Nothing is drawn
     from memory of how such systems usually work.

## How it differs from the diagrams people usually mean

| Kind | What it shows | What it lacks for this purpose |
|---|---|---|
| Data-flow diagram, level 0 (Yourdon/DeMarco) | processes, stores and external entities, with data on the arrows | no control: no loops, no decisions, no order. It implies that steps hand data to each other. This was the first, rejected version. |
| Flowchart | control: boxes, diamonds, arrows | usually no data, no threads, and loops drawn as one arrow going up, without the frame that shows nesting |
| UML activity diagram | control with forks, joins and swimlanes; object nodes for data | the closest standard. This diagram is an activity diagram with loops as interruptible regions, the thread boundary as a partition, and the object flow moved into a side table, because a shared context would otherwise be one object node wired to every action. |
| Sequence diagram | messages between objects over time, for one scenario | one path at a time; loops are `loop` fragments, but the data each participant reads and writes is not shown |
| Class or package diagram (`java-diagrams`) | structure: types and their dependencies | no order and no execution |
| Execution trace (`execution-trace`) | one real run, step by step, with its figures | one path, and the figures of one example; it does not show the branches that run did not take |

**When this is the wrong diagram.**
- **A process with no loop and no branching** is a list, and a sentence or a numbered list says
  it faster. The builder refuses a flow without a loop.
- **A question about one run** ("why did BMW PT fail yesterday?") is an execution trace.
- **A question about which classes depend on which** is a class diagram.
