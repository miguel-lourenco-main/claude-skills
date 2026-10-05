# Content rules

Each rule is here because the first run trace built this way misled a reader without it.
They are about what the page says; `tracekit.validate` checks the ones a program can check.

## What goes on the page

1. **Diagram first.** Every layer, for the whole run and for one step, is a drawing of boxes
   and arrows. Prose lives in the facts pane, behind a selection. A layer that would be a
   table is a layer that has not found its diagram yet.
2. **One phrase per box.** Verb first, 64 characters at most ("Reads the maker's site into
   rows"). A box with three lines is not read; the validator refuses it for steps and classes.
3. **Depth is one click away, and it is real.** Selecting a step shows: the work done, in
   order; what it takes and what it leaves; what happens if it fails; what happened in this
   run, with figures; its phase and who does it; where it starts in the code. Selecting any
   other box shows what the thing *is* and its value in this run — the value, not a
   description of the value.
4. **Say which run, and when.** The whole-run pane states where the figures come from. If
   some steps show figures stored by an earlier run and others figures computed now, each
   step says which. A reader assumes everything on screen happened in one go unless told.

## What a phase is

5. **A phase names who does the work.** "Evaluate" and "Decide" done by the program during
   the run, and again by a person afterwards in a console, are four phases, not two — and
   the person's phases come *after* the acting steps in time while feeding the *next* run.
   Draw that loop as arrows back into the steps it changes, labelled "next run: …".
6. **Order on the page is order in time.** If something reads like it comes earlier but
   runs later, the page shows where it runs.

## What may be claimed

7. **Nothing about people, origin or intent that a file does not state.** The first version
   said every rule "was accepted by a person"; most had been seeded by a script. Read such a
   fact per item from the data (who decided, when), and show it per item.
8. **Not built is drawn as not built.** If the flow the user asked about ends somewhere the
   code does not reach, the last step is a dashed box with a banner, the search that found
   nothing, and what the real last effect is. Never a plausible final step.
9. **No arrow from memory.** Between classes, an arrow is a call in the bytecode. The first
   key-class view drew arrows in the order the classes were listed; they looked right and
   were false. A call the bytecode cannot show is declared with a label that says why.
10. **A walkthrough is not the class list.** Five classes were named for start-up; once
    class loading was measured, the same step drew sixty-six. Measure (`classload.py`), then
    choose which to call "key".
11. **Scope an entry point to what this run does.** A command dispatcher reaches every
    command; walk from the branch this run takes, or the step's graph is the whole program.
12. **A step the measured run skipped says so.** Its classes come from the bytecode alone,
    unfiltered, and the note over the diagram states it.

## What the page must let a hand do

Scroll moves the drawing, Ctrl + scroll (or a pinch) zooms at the pointer, dragging pans,
`←` / `→` step through the run, the number keys switch layers, a double click on a step's
box opens the step. These are in `page.html`; do not remove them when restyling.

## The two-agent reading (optional, once)

A check for whether the page explains the run *without its author*. Spawn two agents that
can message each other:

- **Presenter** — given only the built page (driven in a browser) and the instruction to
  explain the run to a supervisor, step by step, using only what the page shows.
- **Listener** — plays the person the page is for. Interrupts with the questions that person
  would ask ("who decided that?", "is that before or after the export?"), and at the end
  lists: what they could not get answered from the page, anything that turned out false,
  and where the presenter had to leave the page to answer.

Give neither agent the source code or your own summary: an agent handed your reading
returns it confirmed. Sort the findings: false statements first, missing explanations
second. Layout or legibility complaints from headless screenshots are weak evidence — check
them on a real screen before acting on them.
