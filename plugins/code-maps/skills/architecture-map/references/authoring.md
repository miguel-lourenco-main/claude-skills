# Writing a map: membership and words

The projector draws the arrows. What you write is which classes each box stands for, in what
layer, and what the arrows mean in the team's words. This page is the cookbook.

## Membership

- **Prefer a selector to a list.** `{"pkg": "fetch.**"}` stays right when a class is added;
  `"units": ["fetch.JdkHttpFetcher"]` does not. Use `units` for judgement calls only (the two
  links of a stage that live in a shared package), and say so in the box's `note` if it is not
  obvious.
- **A family is a stack.** Every implementer of one interface, every subclass of one base: one
  `stack` with `{"implements": …}` or `{"extends": …}`, `count` asserted if the number is part of
  the story ("the 12 rule kinds"), `drawOnly: ["extends", "implements"]` when only the hierarchy
  matters (115 brand extractors need no 115 `uses` arrows).
- **Deeper wins.** A box inside another may select from the same packages; the inner one takes
  what it matches. So a stage inside a process may say `{"pkg": "rules.**"}` while the process
  says `{"pkg": "**"}`. Two boxes at the same level fighting over a class is a refusal: decide.
- **A class drawn twice is an alias.** When a group uses a class another group owns (the rule
  ledger, read by the proposer), add `{"id": "propor/rules.ledger.RuleLedger", "kind": "class",
  "alias": "rules.ledger.RuleLedger", "parent": "propor"}`: it is drawn dashed in the accent
  colour, this group's arrows land on it, and the macro arrow between the two groups still counts
  the relation once.
- **Leave nothing silently unowned.** The report lists unowned classes. Either a box takes them
  (a "legacy" or "shared" box is honest) or you say in the report that they are out of scope and
  why. In tier 3 everything is owned by construction.
- **Actors are not code.** A site, a database, a front end: `kind: actor`, a `shape`, and
  declared arrows. They never get `members`. A box the team plans but has not built is a
  `component` with `planned: true` — dimmed, no members, declared arrows allowed.

## Layers and nesting

Layers are the bands of the picture, in flow order: external systems, integration, processes,
persistence, API, clients — or whatever the team draws. Only a top-level box names a layer;
its children sit inside it. With `layout.direction: "RIGHT"` the layers are columns (a
pipeline reads left to right); with `DOWN` they are rows (an architecture reads top to bottom).
`nonAdjacentLayers` lists the arrows between bands that are not neighbours; the panel still
shows them with their evidence.

The readable range for a default tier-1 view is 15–40 boxes; `map.mjs` warns outside it. Keep
the inner stages `collapsed: true` and let the reader open them; `drill` can point a stage to its
tier-2 group.

**Tier 0 is the sketch with its flow, not a smaller tier 1.** Every box is a set of classes,
exactly as in tier 1, so the projector still proves what the picture claims; but a box carries
nothing except its name. Two kinds of arrow, and only two: the chain order the process file states
(`meta.process`, cyan, thick — read by rule, never typed), and the bytecode relations between whole
bands (grey; `layout.arrows`). A box with children is a band, bands nest (the OEM sketch: Chain
Rulers inside Chain), and bands stack bottom-up in document order (Maestro, Chain, the contracts).
The bands stack in document order whatever the arrows say, and where the bytecode runs both ways
between two bands the document order decides which way the arrow reads. What the picture does not
carry it does not claim: the classes off it are listed in the reading, and that is the honest
statement of its scope.

The same tier draws the flow **in code terms** when the boxes are classes (`kind: "class"`, with
`layout.arrows: "calls"` and no bands): a spine of the classes the run walks, left to right, with
what each one calls below it and what calls it above it. Which collaborators to show is the one
judgement call — read them off the bytecode (`calls`/`creates` pairs from each link) and keep the
ones a reader needs to follow the run; a class that is not on the picture is listed in the reading
as off it, never implied. The flow types come from the sources, never from a feeling: the branch
from each step's `when:`, the once-per-process tail from `grain()`, and every loop from a cited
line of code (`edges.loops`, `source` required). A loop you cannot point at is not drawn.

Three switches decide how an open box is drawn, and each tier wants a different pair
(measured on the OEM pages, 2026-10-11):

- **Tier 1** — `layout.boundary: "open"` and `flow: "RIGHT"` on the process box and its parent.
  An arrow that leaves an open box then attaches to the box's frame, every arrow joins two
  siblings, and the page can lay each box out on its own: the stages inside the process read
  Extract → Enrich → Evaluate → Decide → Executor in document order, with the box's own classes
  after them. Without `open`, ELK lays the whole hierarchy out in one direction and ignores a
  box's `flow`.
- **Tier 2** — `layout.direction: "DOWN"` with `layout.openDirection: "RIGHT"`. Closed, the
  seven components sit in rows and fit one screen; open, the component's classes read left to
  right and the page zooms to it. Tier 2 keeps class-to-class arrows across sub-boxes, so its
  boxes cannot be laid out on their own and `flow` on a root component does nothing there.
- **Tier 3** — `layout.boundary: "open"` and `layout.packClosed: true`. A package whose visible
  children are all closed is packed in a grid (a layered layout of twenty closed packages with
  seventy-five arrows spread them over a sheet five times wider and took three seconds); the
  arrows into an open package attach to its frame with a count.

Two boxes of one layer that have an arrow between them keep their row: that arrow, and the words
on any root-level arrow, are placed by the page rather than by ELK, because a label inside ELK
takes a layer of its own and pushed a box out of its row.

## Words

- **A label is what the arrow does, in three or four words**, from the point of view of the
  source box: "lê as páginas", "entrega o comando run", "guarda snapshots e registos". Not the
  relation kind (the panel says that), not a sentence.
- **A description is one sentence** a reader of the panel needs: what passes, when, through
  what. It may name a method or a slot.
- **Words go on arrows that exist.** `edges.derived` is keyed by the two box ids; if no relation
  runs between them the entry is stale and refused. When the graph changes, the stale ones are
  listed, and `--prune-words` removes them — tell the user which.
- **Hiding needs a reason.** `{"from", "to", "hide": "já implícita: a Admission lê os achados do
  TrapContract"}` lists the arrow with that text. A `quiet` class does the same for every arrow
  into it (a result type everything uses). Both are shown in the panel; nothing disappears.
- **Phrases are one line per box**, in the team's language, saying what the box is for — not
  what it is called. Take them from the Javadoc or the code; a phrase the code does not support
  is a guess, and a guess on an architecture page outlives the code.
- **`meta.requireWords: true`** on a curated tier: every drawn arrow has words, or the build
  fails. On tier 1 leave it off and label the few arrows that carry the story; the rest keep
  their technical reading in the panel.

## What the report should make you do

| The report says | You do |
|---|---|
| `REFUSED: … is claimed by both A and B` | decide which box owns it; the other loses it or aliases it |
| `… selectors match nothing` | the family moved or the name is wrong; check the graph before `optional: true` |
| `words on A -> B are stale` | the relation is gone or the boxes changed; read the evidence before pruning |
| `GRAPH CHANGED … counts: X: 12 -> 14` | two classes joined a box; check the words still hold, then `--accept-graph --write-map` |
| `tier 1 shows 52 boxes by default` | collapse the inner groups or merge boxes |
| `N drawn arrows without words` | write them (tier 2), or leave the technical reading (tier 1) and say so |
| `NOT ACCOUNTED` | a bug in the projector, not in your document: report it with the failure text |
