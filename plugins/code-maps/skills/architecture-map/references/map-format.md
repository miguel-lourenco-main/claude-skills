# The map document (`*.map.json`)

One format for the three tiers. A person or an agent writes the **authored** fields; `map.mjs`
adds the **computed** ones to `<name>.resolved.json`; the page strips them again when it saves.
Computed fields in an authored document are ignored, except evidence on a declared arrow
(`covers`, `ev`, `n`, `rel`), which is refused. Class and package ids are **relative to the
root package** the graph shares (`process.maestro.Maestro`, not `com.acme.process.maestro.Maestro`),
so a document survives a package move.

## Top level

| Key | Type | What |
|---|---|---|
| `format` | string | `"code-maps/map@1"` |
| `meta.tier` | 1, 2, 3 | sets defaults and the readable bounds, not the semantics |
| `meta.root` | package | the package the document's ids are relative to; written by the seeds and `--write-map`; pin it so a rename of the packages above it changes nothing. Without it, the longest package every class shares |
| `meta.title`, `meta.lang` | string, `pt` or `en` | the heading; the language of the page's words and of the relation words in the evidence |
| `meta.graph` | computed, written by `--write-map` | `{hash, units, pairs, root, counts}` — the graph the words were written against; `counts` is classes per box, printed as a delta when the graph changes |
| `meta.auto` | `"packages"` | tier 3: every package becomes a `package` box, every class a `class` box, unless a node in the document claims it first; nodes with the same id (`p:rules`, `rules.RuleKind`) merge over the automatic ones |
| `meta.single` | bool | one top-level group open at a time; the default view is all closed |
| `meta.entryMethods` | [string] | method names the automatic key pick puts first (`run`, `apply`, …) |
| `meta.requireWords` | bool | a drawn arrow without a `label` fails verification instead of warning |
| `meta.links` | {tier: file} | the other tiers' pages, for the reader |
| `layout.direction` | `DOWN` (default), `RIGHT`, `UP`, `LEFT` | the flow; layers become horizontal bands (`DOWN`) or columns (`RIGHT`) |
| `meta.tier` | `0`, `1`, `2`, `3` | `0` is the sketch with flow: every box carries its name only; a group is a band (cyan; `shape: "row"` makes it grey) holding its children, bands nest; `style` forces a look (`bar`, `box`, `type`, `muted`) where the derived one — outlined for a box of contracts only, grey for planned/legacy — is not wanted. Output: draw.io XML + SVG (`drawio.mjs`) |
| `meta.process` | path, relative to the document | tier 0: the process file whose `chain:` lists the links in order; each `link: x` is the class whose `name()` returns `"x"` (read from `--sources`; `XLink` by convention without them), and consecutive links give the cyan flow arrows between the boxes that own them. Refused when a link has no class |
| `layout.arrows` | `bands` (default), `flow`, `calls`, `all` | tier 0: which bytecode arrows join the flow — `bands`: one grey arrow per pair of top-level bands (the projection with nothing open); `flow`: none; `calls`: the pairs where one box calls, creates, implements or extends the other (what the flow passes through, not what it merely names — the setting for a picture of classes); `all`: every pair. Every arrow is lifted to the two boxes that sit beside each other under their nearest common band, so a band keeps its own layout and the flow between two bands is one arrow; both ways merge into one two-headed arrow pointed in document order |
| `kind: "class"` boxes in tier 0 | | a box may be one class (`id` = the class, as in tier 2): the picture of the flow in code terms. With no bands at all the picture is **flat**: the spine (the class that runs the chain, the step before it that every entry calls, then the links in the process file's order) in one row, what a spine class calls stacked below it, what calls it stacked above it, a class reached only through a side class beside that class; arrows that skip a step and the loops run on lanes above the row, calls that reach another column on lanes below it. Call arrows start on the flow or join two side classes; a side class calling back into the flow, and the flow's own `implements Link`, are not drawn. Positions and routes are the generator's, not ELK's |
| repeated boxes (tier 0, flat) | | a side class is drawn again, marked (dashed outline, 55% opacity, italic, draw.io id `<class>@<spine class>`), under every spine class whose column calls it, so no call arrow crosses the sheet; the copy carries only that column's arrows, the original sits in the leftmost column that reaches it (so the first box a reader meets is the original) and keeps the rest. The reading counts a class once. A self-loop is a small lasso (over a spine box, to the right of a side box), top-edge arrows get their own attachment point, lane labels sit where no other line crosses, and a legend of the marks closes the sheet (pt-PT, like the flow labels) |
| `entry` on a class box (tier 0) | method name | the box stands for one of its methods (`CommandRunner` for `run`): a call it makes is drawn only when the bytecode evidence shows that method making it (`run→…`); where the evidence list is capped (more calls than listed) the arrow is kept, since absence from a capped list proves nothing |
| `meta.chainRunner` | box id | tier 0: the class that runs the chain; the flow starts there, one arrow per mode into the first link of that mode |
| arrow words on the flow | | tier 0 writes two kinds of word on a flow arrow, both read from the sources: the mode when only one walks it (`live` / `replay`, from each step's `when:`) and `uma vez por processo` where a link's `grain()` turns to PROCESS |
| `edges.loops` | `[{at}` or `{from, to}, label, source]` | tier 0: a loop the code holds — on one box (`at`) or back from one box to another (`from`, `to`); `label` says what it runs over, `source` cites the file and line (`Chain.java:38`), required, because a loop is not in the bytecode graph and a drawn one must point at the code that has it |
| `layout.direction` (tier 0) | `UP` (default), `DOWN` | how the top-level bands stack, always in document order: `UP` puts the first band at the bottom, as the sketch has it; `DOWN` reads like a call flow from the top. Inside a band the children read left to right unless the band says `flow` (the OEM flow picture stacks its phases with `flow: "DOWN"`); a band without arrows inside keeps document order |
| `layout.openDirection` | same values; default = `direction` | the flow while at least one box is open; the macro view keeps `direction` (tier 2: rows when closed, so the seven components fit one screen; columns when a component is open, so its classes read left to right) |
| `layout.boundary` | `root` (tier 2 default), `open`, `none` (others) | `root`: an arrow that crosses a top-level group attaches to the group's frame, so an open group shows only its inner arrows and the macro arrows; `open`: it attaches to the outermost open box it leaves, so an open box shows its inner flow and one arrow per outside partner (the slide's look); `none`: inner boxes draw their own arrows outward |
| `layout.packClosed` | `false` (default), `true` | `true`: a box whose visible children are all closed is packed in a grid instead of layered by its arrows, and those arrows are routed by hand; for browsing packages (tier 3), where a layered layout of twenty closed packages spreads them over a sheet five times wider |
| `layout.labels` | `words` (tier 1 default), `all` | what an arrow prints: the written words only, or also the technical reading (field names, «creates», `k of N`) |
| `layers[]` | `[{id, title}]` | in flow order; a top-level node names one in `layer`, its children inherit it |
| `nodes[]` | see below | |
| `edges.derived[]` | words only | `{from, to, label, desc}` or `{from, to, hide: "why"}`; valid only if some relation runs between the two boxes (else stale: refused, or removed with `--prune-words`) |
| `edges.declared[]` | | `{from, to, label?, desc?, both?}`; at least one end an `actor` or a `planned` box; drawn dash-dot, no evidence |
| `edges.rules[]` | | `{rule, scope?, why?}` with `rule` ∈ `implied` (an arrow a path of other drawn arrows already implies is listed, not drawn; default scope `inside` a top-level group), `nonAdjacentLayers` (between top-level boxes whose layers are not neighbours; default scope `top`); `scope` ∈ `inside`, `top`, `all`; `why` is the text shown, defaulting to the language's |
| `hints` | written by `--seed` | what the graph suggests; the projector ignores it; delete when done |

## Node

```
{ id, kind, title?, parent?, layer?, phrase?, note?, planned?, shape?,
  members?, unit?, alias?, count?, keys?, show?, drawOnly?, quiet?, collapsed?, flow?, reduce?, drill?, pos? }
```

| `kind` | holds classes through | notes |
|---|---|---|
| `actor` | nothing | `shape`: `system`, `person`, `store`; only declared arrows touch it |
| `component` | `members` and its children | `planned: true` = no members, dimmed, may carry declared arrows; `note` is a short line under the title (what enters, what it is for); `flow` lays its children out `DOWN` or `RIGHT`; `drill: {tier, node}` points the reader to the same thing in another tier |
| `package` | `members.select: [{pkg}]`, usually automatic | `reduce: false` turns off stacking and folding when it opens past the cap |
| `stack` | `members`, usually a selector | several classes with one role, drawn as one box; `title` may contain `{n}`; `count` asserts the size; `drawOnly: ["extends", "implements"]` lists every other arrow instead of drawing it |
| `class` | exactly one: `id` is the class id, or `unit` names it | `alias: "<class>"` echoes a class another box owns, so this group's arrows to it land here; `keys: {fields, methods}` replaces the automatic pick; `show`: `name`, `keys` (default below tier 3), `all`; `quiet: "why"` lists arrows into it instead of drawing them |

Hierarchy is `parent`. `layer` is allowed on top-level nodes only (the layout engine
partitions one level). `collapsed` is the state the page opens in; opening and closing on the
page is not an edit. `pos: [x, y]` is a hand position relative to the parent's top-left corner;
it wins over the automatic layout, the subtree moves with it, and the group grows to hold it.
Ids may not contain `>` or end in `/own`.

### Members and selectors

```json
"members": { "units": ["extract.Route"],
             "select": [{"implements": "extract.Extractor"}, {"pkg": "extract.**"}, {"name": "*Link"}, {"annotated": "RestController"}],
             "except": [{"pkg": "extract.fixture"}],
             "optional": false }
```

Selector atoms: `pkg` (exact; `a.b.*` one level down; `a.b.**` the package and everything
below; `**` all), `implements` / `extends` (the direct ones, `"transitive": true` for the whole
hierarchy), `annotated` (simple annotation name), `name` (glob on the simple name, `*` only).
Several keys in one selector are ANDed. Resolution: explicit `units` and class ids claim first;
then selectors, the deeper box winning along one line of ancestry; two boxes at the same level
selecting the same class is refused; a selector that matches nothing is refused unless
`optional`; a `count` that disagrees with the graph is refused. Selectors are re-resolved on
every run, so a new class in a family lands in its stack by itself.

## Computed, in `<name>.resolved.json`

`meta.graph` as above. `resolved.nodes[id]`: `{kind, parent, units[], count, children[], auto?, unit?, members?, facts?}`,
where `facts` (class boxes) is name, package, kind, source and line, annotations, supertypes, all
fields, public methods, nested types, how many use it and it uses, subtypes, `keyFields`,
`keyMethods`, and — with `--sources` — the first paragraph of the Javadoc (`doc`) and the file;
with `--docs` a translation `docPt` when its English still matches. `resolved.unowned` lists the
classes no box holds. `resolved.levels` is the report per state: `full`, `default`, `top`, and
with `meta.single` each top-level group alone (`open:<id>`), each with the visible boxes,
relations in scope, arrows drawn and listed (with a count per reason), declared arrows, the
automatic stacks, `accounted` and the failures.

An arrow on the page (never in the authored file) is `{id, from, to, rel, n, covers, kinds, label, tech, desc, drawn, why, mutual, ev}`:
`rel` the strongest relation among the pairs it covers (`extends` > `implements` > `field` >
`dep` > `weak`), `n` the pairs, `tech` what the drawing itself can say (field names and
multiplicity, «creates», «nested type inherits», `k of N` for a stack, the most used class
`+k`), `ev` up to 14 pairs with their relation kinds, members, lines and counts.
