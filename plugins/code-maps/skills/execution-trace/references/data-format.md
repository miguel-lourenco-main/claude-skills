# The data the page reads

`tracekit.write_page(data, …)` validates this value, writes it as `trace-data.json`, and
inlines it into `page.html`. The page draws whatever is here; nothing about a project is in
the page itself.

## Top level

| Key | Type | What |
|---|---|---|
| `title` | string | the page heading |
| `command` | string | the command the run was started with, shown beside the heading |
| `subject` | string | the example the figures come from; heads the whole-run pane |
| `intro` | [string] | paragraphs of the whole-run pane: which run, when, how many steps |
| `lenses` | [lens] | the layers, in tab order |
| `steps` | [step] | the steps, in the order they run |
| `graphs` | {lens id: graph} | one graph per layer, over the whole run |
| `codeSteps` | {step id: step graph} | the Code layer of one step (only for a lens with id `code`) |
| `legend` | {`boxes`: [[kind, text]], `lines`: [[kind, text]]} | optional: the legend in the project's words |
| `kinds` | {kind: text} | optional: the label over a selected box, per kind |

## Lens

`{"id", "label", "whole", "step", "flat"}` — `whole` is the one-line claim shown over the
diagram of the whole run, `step` the one shown over a single step. `flat: true` drops the
group frames when one step is open (right for the process layer).

The page gives every lens two views from the same graph: the whole run, and one step — the
boxes that belong to the step (`node.step`) plus everything one arrow away.

## Step

| Key | What |
|---|---|
| `id`, `name` | stable id; `name` is what the code calls the step |
| `title` | plain-language heading |
| `stage` | the phase it belongs to; the left rail groups by it |
| `kind` | `step` (default), `frame` (before the steps proper), `human` (a person does it), `gap` (not built) |
| `what` | two or three sentences. `` `backticks` `` render as code |
| `banner` | required for a `gap`: the sentence that says it is not built |
| `badges` | `[{"text", "on"}]` short facts under the heading |
| `detail.sections` | `[{"title", "text", "list", "loc", "note", "code"}]` — the in-depth explanation, in order. `text` a string or list of paragraphs, `list` ordered work, `loc` a code location, `note` a muted line, `code` excerpts |

Anything else on a step (the builder's own `work`, `stack`, `entries`) is ignored by the page.

## Graph

`{"nodes": [node], "edges": [edge], "clusters": [{"id", "label"}], "empty": [step ids]}`

`empty` lists the steps with nothing to draw in this layer; the page then says so. A step
that is neither drawn nor listed fails validation — it would look unfinished.

**Node** — `{"id", "kind", "title", "rows", "step", "cluster", "detail"}`

- `kind`: `step`, `frame`, `human`, `gap`, `class`, `slot`, `data`, `file`, `ext` (outside
  the program), `alt` (another mode's version of a step).
- `rows`: the phrase. One string. Data boxes may carry more, and a row may be
  `{"t": text, "cls": "chg" | "void"}` to mark a changed or still-empty value.
- `step`: the step this box belongs to. Double-clicking it opens that step.
- `detail`: `text` [paragraphs], `kv` [[key, value]], `table` {`head`, `rows`},
  `file` {`name`, `text`}, `json` (any value, pretty-printed), `code` [excerpt],
  `methods` [string], `uses` [[class, steps]].

**Edge** — `{"from", "to", "label", "kind"}` with kind `flow` (runs next, calls), `read`,
`write`, `alt` (another mode, conditional, next run), `gap` (not built), `seq` (the faint
order of the run in a layer that is about something else).

**Excerpt** — `{"file", "from", "to", "code"}`, as `Repo.excerpt` returns it.

## Step graph (Code)

A graph, plus `note` (how it was obtained: measured or not) and
`key: {"nodes": [ids], "edges": [edge]}` — the small view shown first. Every key edge must
be one of the graph's own edges, or carry `declared: true` and a `label`. A class node has
`entry: true` when the step starts in it and `sub`: its package relative to the prefix.

Id prefixes used by the kit: `s:` step, `k:` class, `g:` package, `c:` cluster; the lens
helpers take the prefix for their own things (`v:` state, `f:` file in the template).
