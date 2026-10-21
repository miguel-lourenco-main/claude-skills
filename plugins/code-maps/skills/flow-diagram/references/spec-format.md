# The spec `flowdiagram.py` reads

One JSON object. The agent writes it from the code, and the script owns every coordinate,
colour and font. `examples/extract-catalogue.json` is a complete spec: a service where an HTTP
thread hands work to a pool, an orchestrator loops over items, and a chain loops over steps.
Start from it.

## Top level

| Key | Required | What |
|---|---|---|
| `title` | yes | the page name, 2 to 4 words (the browser tab and the gallery) |
| `aria` | yes | one sentence saying what the diagram shows, for screen readers |
| `flow` | yes | the blocks, top to bottom (below) |
| `heading`, `eyebrow`, `intro` | no | the page header; `intro` says what is on the left and what is on the right |
| `flow_header`, `data_header` | no | the two column titles inside the figure |
| `tables` | when a node links one | `{id: table}` (below) |
| `caption` | no | paragraphs under the figure; an item `{"list": [...]}` becomes a bullet list |
| `uses` | no | `[[class, what it uses], …]`: constructor dependencies, shown as a table under the figure |
| `evidence` | yes in practice | one paragraph naming the methods and files everything was read from |

## Blocks in `flow`, and in a loop's `body`

Every block may carry `"in": "label"`, the label on the arrow that enters it.

**A node, one call.**
```json
{"node": "Class.method(args)", "sub": ["the effect that matters"], "style": "proc",
 "id": "caller", "refuse": {"to": "client", "label": "400 with the reason"},
 "returns": {"to": "client", "label": "202 {id}"}, "data": "tableId", "data_label": "step i"}
```
- `style` is one of:
  - `proc`, a call (the default);
  - `key`, a call that carries the work, drawn with a tinted fill;
  - `ext`, an outside party such as a client or a browser, drawn narrower with a heavy border.
- `id` lets a `refuse`, `returns` or `branch` point back at this node.
- `refuse` draws a dashed edge up the right rail to the node it names, for refusals.
- `returns` draws a dashed edge up the left rail, for answers that come back before the work
  is done.
- `data` links the node to a table, which is drawn beside the outermost loop that holds the
  node.

**A decision.**
```json
{"decision": "result.status", "sub": "and the step's onError",
 "back": ["CONTINUE, or FAIL", "with onError continue"],
 "branch": {"to": "exit", "label": ["STOP, or FAIL", "skip-target | abort"]}}
```
- `branch.to` is one of:
  - `exit`: leave the innermost loop, landing on the node after it;
  - `next`: skip to the next turn, re-entering at the top of the loop's first block;
  - a node `id`: a dashed edge to it, for refusals.
- `back` draws the edge back to the top of the innermost loop, with its label lines.
- `either: true` declares that both answers continue to the same block, as with a mode switch.
- A decision with none of `branch`, `back` and `either` is refused.

**A thread boundary.**
```json
{"thread": {"above": "HTTP request thread", "below": "worker thread"}, "in": "submit"}
```

**A loop.**
```json
{"loop": {"title": "CHAIN LOOP · Chain.run(ITEM, ctx)", "sub": "the ITEM steps, in process order",
          "back_label": "next item", "exit_label": "the rest: SKIPPED", "body": [ … ]}}
```
- `back_label` is required unless the body ends with a decision that has `back`. It labels the
  edge from the last block back to the first.
- `exit_label` labels where the loop's exits land, on the node after the loop. A loop with
  exits must be followed by a node.
- Loops nest. Each level widens its frame, so the nesting is visible.

## Tables

```json
"item": {"title": "The ITEM steps", "sub": "they share the item's context; no data passes between them",
         "columns": ["step · onError", "reads", "writes · I/O"],
         "rows": [{"name": "1 fetch", "tag": "skip-target", "reads": ["item, RunScope"],
                   "writes": ["ROUTE, MARKET,", "PULL_RESULT"], "io": ["⇄ maker sites"]}]}
```
- `reads`, `writes` and `io` are lists of lines. Break a long list yourself; the builder
  refuses a line that does not fit its column and says by how much.
- `io` uses `←` for read, `→` for write and `⇄` for both.
- A row grows to its longest cell. Each table must be linked by exactly one node.

## What the builder refuses

Each of these exits with status 1 and a message saying what to change:
- a flow with no loop;
- a loop with no body, or with no way back;
- a decision with one path;
- an exit or a back edge outside any loop;
- a loop with exits that is the last block of its sequence;
- a `refuse`, `returns` or `branch` naming an id no node has;
- a duplicate id;
- a table no node links, or one linked twice;
- any label wider than its box, diamond or column.
