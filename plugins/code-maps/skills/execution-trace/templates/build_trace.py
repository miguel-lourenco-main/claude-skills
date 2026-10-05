#!/usr/bin/env python3
"""Build the run trace of <PROJECT>: one run of `<COMMAND>`, step by step.

    python3 <this file>            # -> trace-data.json + dist/run-trace.html

Copied from the execution-trace skill and filled in for this project. `tracekit.py` and `page.html`
sit beside this file (copied from the skill) so the page rebuilds here without the skill installed.

What is written by hand in this file is the READING of the run: which steps there are, one phrase
for each, and the explanation behind it. What is never written by hand: code (cut from the source
at an anchor), figures (read from the files the run wrote), and arrows between classes (read from
the bytecode). If a fact cannot be read from somewhere, it does not go on the page.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tracekit as tk

# ── 1 · the run this page shows ──────────────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(HERE))            # the repository root, from where this file sits
repo = tk.Repo(ROOT)

TITLE = "<Project> run trace"                            # the page's heading
TAB = "<Project> Run Trace"                              # the browser tab / artifact name: two to four words
COMMAND = "<the exact command the run was started with>"
SUBJECT = "<the one example the figures come from, e.g. a customer, a target, a file>"
PREFIX = "com.acme.app."                                 # the project's own packages, with the trailing dot
CLASSES = os.path.join(ROOT, "target/classes")           # compiled classes (Gradle: build/classes/java/main)
SOURCES = ["src/main/java"]                              # relative to ROOT
CLASSLOAD = "report/run-trace/classload.json"            # written by classload.py; None if not measured
S = "src/main/java/com/acme/app/"                        # shorthand for paths below

# The record of the example run, read once. Every figure on the page comes out of files like these.
# run = repo.load_json(repo.latest("target/runs/<subject>"))
# assert len(run["rows"]) == ..., "the page's numbers are asserted against the record, not eyeballed"

# ── 2 · the stages, and who does the work in each ────────────────────────────────────────────
# A stage is a phase of the work. Say WHO does it (the program, on its own? a person, later?) —
# when the same kind of work happens both automatically and by hand, those are two stages.
STAGES = {
    "Start": ("The program, before any real work.", "Reads its settings and decides what this run will do."),
    "Work": ("The program, once per <unit>.", "<what this phase is for>"),
    "Not built": ("Nobody yet.", "<what the flow is meant to end in, and does not>"),
}

# ── 3 · the steps ────────────────────────────────────────────────────────────────────────────
# One dict per step, in the order they run. Keys:
#   id, name      short and stable; `name` is what the code calls it
#   title         a plain-language heading
#   stage         a key of STAGES
#   kind          "step" (default) | "frame" (before the steps proper) | "human" (a person does it)
#                 | "gap" (not built: no code, drawn dashed; needs `banner`)
#   phrase        THE one phrase on the box (≤ 64 characters). Verb first: "Reads the site into rows"
#   what          two or three sentences: what the step does
#   work          the ordered list of what happens inside it
#   takes, leaves what it needs from earlier steps, what it leaves for later ones
#   fails         what happens to the run if this step fails (omit if nothing special)
#   here          what happened in THIS run, with its figures — read from the run's files
#   stack         the walkthrough: repo.call("Class.method", file, anchor), outermost first
#   excerpts      repo.excerpt(file, anchor, lines) — the lines worth reading, cut at build time
#   entries       [(class, method)] the bytecode walk starts from; omit for a step with no code
#   dispatch      {interface: [the implementations THIS run uses]} when an interface has many
#   badges        [{"text": "live only"}, {"text": "acts", "on": True}] — short facts under the heading
STEPS = [
    dict(id="boot", name="boot", title="Start the program", stage="Start", kind="frame",
         phrase="Reads the settings and picks the command",
         what="<…>",
         work=["<first thing that happens>", "<second>"],
         takes="The command line and the settings file.", leaves="<…>",
         here="<what this run was asked to do>",
         stack=[repo.call("Main.main", S + "Main.java", "public static void main")],
         excerpts=[repo.excerpt(S + "Main.java", "public static void main", 8)],
         entries=[(PREFIX + "Main", "main")]),
    # … one per step …
    dict(id="db-load", name="db-load", title="Load into the database", stage="Not built", kind="gap",
         banner="Not built. The flow as it exists ends at <the last real step>.",
         phrase="Nothing does this yet",
         what="<what is missing, and the evidence that it is missing: which search found no code>",
         work=["Nothing runs here."], takes="<what it would take>", leaves="Nothing.",
         here="nothing was written"),
]
by_id = {s["id"]: s for s in STEPS}
for i, s in enumerate(STEPS):
    who, phase = STAGES[s["stage"]]
    s["detail"] = {"sections": [x for x in [
        tk.section("The work done here", list=s["work"]),
        tk.section("What it takes, what it leaves", text=[s["takes"], s["leaves"]]),
        tk.section("If it fails", text=s.get("fails")),
        tk.section("In this run (" + SUBJECT + ")", text=s["here"]),
        tk.section("Its phase: " + s["stage"], note=who, text=phase),
        tk.section("Where it starts in the code",
                   loc=f"{s['stack'][0]['call']} — {s['stack'][0]['file']}:{s['stack'][0]['line']}" if s.get("stack") else None),
        tk.section("Worth reading", code=s.get("excerpts")),
    ] if len(x) > 1]}

# ── 4 · the layers ───────────────────────────────────────────────────────────────────────────
# Each layer redraws the same run. Keep the ones this project has something to say in; a layer
# with nothing but the spine is noise. `whole` and `step` are the one-line claims shown over the
# diagram for the whole run and for one step.
LENSES = [
    dict(id="process", label="Process", flat=True,
         whole="Control flow: which step runs after which.",
         step="Where this step sits in the run, and what runs before and after it."),
    dict(id="code", label="Code",
         whole="One box per package, listing the classes the run uses in it. An arrow is \"calls into\"; its number counts the class-to-class calls.",
         step="The classes this step's code reaches, grouped by package."),
    dict(id="state", label="State",
         whole="What the steps leave in memory for each other: a solid amber arrow writes, a dashed one reads.",
         step="What this step reads, and what it writes."),
    dict(id="disk", label="Disk",
         whole="What each step reads from disk and what it leaves there. The dotted line is the order of the run.",
         step="The files this step reads and writes."),
]
graphs = {}

# process: the chain, then every way the flow is NOT a straight line — another mode, a loop back
# from something a person does later, the part that is not built.
g = tk.process_lens(STEPS, list(STAGES), labels={})
# g["edges"].append(tk.edge("s:review", "s:rules", "next run: accepted rules", "alt"))
graphs["process"] = g

# code: read from the bytecode, kept to what the measured run loaded.
bc = tk.Bytecode(CLASSES, PREFIX)
loaded = tk.Loaded(repo.load_json(CLASSLOAD)) if CLASSLOAD else None
lens = tk.CodeLens(repo, bc, SOURCES, excerpts=[e for s in STEPS for e in s.get("excerpts", [])])
code_steps = {}
for s in STEPS:
    if not s.get("entries"):
        continue
    measured = loaded is not None and not s.get("unmeasured")      # set unmeasured=True on a step the measured run skipped
    code_steps[s["id"]] = lens.step_graph(
        s["entries"], [lens.fq_of(c["file"]) for c in s["stack"]],
        note=("Read from the bytecode: every class this step's code can call into, kept to the classes the JVM loaded in the measured run."
              if measured else
              "Read from the bytecode. Not filtered by what was loaded: the measured run did not execute this step."),
        keep=(lambda t: t in loaded) if measured else None, dispatch=s.get("dispatch"))
graphs["code"] = tk.CodeLens.overview(code_steps, {s["id"]: i + 1 for i, s in enumerate(STEPS)})

# state and disk: the things steps leave for each other. Give each ONE phrase and a real explanation;
# show the value from the example run (json=…, kv=…) rather than describing it.
graphs["state"] = tk.resource_lens(STEPS, [
    # dict(id="rows", title="rows", phrase="The rows read from the source", text="<what it is, its type, who relies on it>",
    #      writes=["fetch"], reads=["check", "export"], json=tk.trim(run["rows"][0])),
], "slot", "v")
graphs["disk"] = tk.resource_lens(STEPS, [
    # dict(id="export", title="target/exports/<run>/rows.csv", phrase="The served rows, as CSV", text="<…>",
    #      writes=["export"], kv=[["size", f"{repo.size(path)} bytes"]]),
], "file", "f")

# ── 5 · write ────────────────────────────────────────────────────────────────────────────────
data = {
    "title": TITLE, "command": COMMAND, "subject": SUBJECT,
    "intro": [
        "<Where the figures come from: which run, of what, when. If some steps show stored figures and others computed ones, say which.>",
        "<How many steps, of which kinds — read from the lists above, e.g. f\"{len(STEPS)} steps\".>",
    ],
    "lenses": LENSES, "steps": STEPS, "graphs": graphs, "codeSteps": code_steps,
    # "legend": {"boxes": [["step", "a step of the pipeline"], …], "lines": [["alt", "replay mode"], …]},   # rename to the project's words
}
tk.write_page(data, os.path.join(HERE, "trace-data.json"), os.path.join(HERE, "dist", "run-trace.html"),
              page=os.path.join(HERE, "page.html"), tab_title=TAB)
