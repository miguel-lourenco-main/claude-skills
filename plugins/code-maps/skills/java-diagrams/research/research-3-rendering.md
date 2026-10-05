# Research 3: rendering, layout, readability (started 2026-10-02)

## Notes as read (A)
- READ mermaid.js.org classDiagram, layouts, schema-docs/config: maxTextSize default 50000, maxEdges default 500, securityLevel strict. Class diagram arrows: <|-- inheritance, *-- composition, o-- aggregation, --> association, ..> dependency, ..|> realization. Namespaces; nested namespaces v11.15+. Docs state ELK bundled and default layout as of v12 (docs claim; verify actual version in practice). Tiny build omits ELK. Generics with commas unsupported.
- READ plantuml.com/elk: `!pragma layout elk`; class + deployment; ELK bundled since V1.2024.6; "alpha".
- READ d2lang layouts: dagre default (container limits), ELK, TALA (proprietary, D2 team; per-container direction). class shape: +,-,# visibility, methods contain "(". Page didn't confirm UML arrowheads.
- READ hpcc-js-wasm README: @hpcc-js/wasm-graphviz, Apache-2.0, jsDelivr, `await Graphviz.load(); graphviz.dot(src)` -> SVG.
- READ elkjs README: elk.bundled.js, web worker mode, algorithms layered/stress/mrtree/radial/force/disco.
- READ d2 connections: arrowheads triangle, arrow, diamond, circle, box, cf-*, cross; filled toggle via style.filled -> UML hollow triangle = triangle+filled:false; diamond filled true/false. No dashed-line-with-hollow-triangle preset but style.stroke-dash exists (known).
- READ graphviz shapes doc: HTML-like labels with shape=none margin=0 are the way to build compartments; records superseded. Arrows page: onormal = hollow triangle (the fetch summarizer said "inv" - WRONG, page lists onormal), odiamond open diamond, diamond filled; dashed via style=dashed on edge; dir=both + arrowtail for diamond at the source end.
- READ plantuml class-diagram: all UML arrows, nested packages, hide/show/remove, together, page split. READ plantuml smetana: pure-Java port of dot, no Graphviz install.
- READ cytoscape.js home (MIT, compound nodes, 70+ ext). fcose README (MIT, compound, ~2x faster than CoSE, quality draft/default/proof). expand-collapse README (MIT, meta edges, collapseEdges; "no longer maintained" note by authors).
- READ kroki.io: 30+ libs, MIT, GET (deflate+base64)/POST, self-hostable.
- READ c4model.com + /diagrams/component: 4 levels; component diagrams "only if they add value", automate for long-lived. No numeric element guidance on those pages.
- npm registry facts (queried 2026-10-02): elkjs 0.12.0 EPL-2.0 OR GPL-3.0+; @hpcc-js/wasm-graphviz 1.29.2 Apache-2.0; @viz-js/viz 3.31.0 MIT; mermaid 12.1.0 MIT; cytoscape 3.34.3 MIT; cytoscape-fcose 2.2.0, -elk 2.3.0, -dagre 4.0.1, -expand-collapse 4.1.1 all MIT; @xyflow/react 12.12.0 MIT; @antv/g6 5.1.1 MIT; @antv/x6 3.1.8 MIT; nomnoml 1.7.0 MIT; @dagrejs/dagre 3.1.1 MIT; likec4 1.59.4 MIT; d2 (npm wrapper) BSD-3 / @terrastruct/d2 0.1.33 MPL-2.0; sprotty 1.4.0 EPL-2.0 OR GPL-2.0+CPE; jointjs 3.7.7 / @joint/core 4.3.3 MPL-2.0. Local machine has java + node only; no dot/d2/mmdc/plantuml installed.

## MEASURED locally (bench/b.mjs in scratchpad; random DAG, avg out-degree ~1.8, node box 170x90, BT/UP direction)
| nodes | edges | dagre | elkjs layered ORTHOGONAL | graphviz-wasm dot (default boxes) |
| 50 | 86 | 39ms | 112ms | 20ms |
| 150 | 267 | 102ms | 130ms | 24ms |
| 300 | 540 | 318ms | 245ms | 81ms (286KB SVG) |
| 600 | 1076 | 1078ms | 693ms | 290ms (597KB SVG) |
Layout-compute is NOT the binding limit; readability is: ELK canvas for 150 random nodes = 13405x2874 px, 300 = 22023x5034, 600 = 42270x8904. Caveat: random graph, no hierarchy/ports/labels; real code graphs are sparser/clustered; compound nodes + edge labels are much slower in ELK/dot (not measured).

## Part B reads
- READ agilemodeling.com class diagram: NO numeric guidance (so don't cite Ambler for numbers).
- READ lattix DSM doc: cells = aggregated leaf dependency; partitioning finds layers/cycles (square blocks); collapse hierarchy with +.
- READ IntelliJ class-diagram doc: member visibility toggles, greys out classes outside scope package, add/remove nodes, Analyze Graph (filter paths between two nodes, focus on immediate connections, centrality).
- SEARCH (snippet only, not full read): Moody Physics of Notations "manageable complexity" cites Miller 7+-2 elements per diagram as complexity limit, remedy = modularisation + hierarchy (semanticscholar pdf link found: pdfs.semanticscholar.org/fbc6/0c004d84d6ee55aaa02f34a823da4f898b2b.pdf). Purchase et al.: user preference 93% fewer crossings, 91% fewer bends, 73% narrower, 61% orthogonality (ResearchGate snippet, "User preferences" paper); priority: crossings > bends > horizontal labels > joined inheritance arcs > narrower > orthogonality. Practitioner snippet: "17 classes probably upper limit on standard page" (bellekens.com, unverified). Holten 2006 HEB: bends adjacency edges along hierarchy path -> bundles; shows implicit parent-level edges. NDepend: graph doesn't scale -> DSM; black cells = mutual dependency, red rectangles = cycles. Sourcetrail docs: focus on selected symbol, incoming+outgoing; members collapsed with hidden-count on expander; "bundled edges" show count; bundle nodes sharing same relations in huge inheritance graphs. Sonargraph cycles detected at modules/namespaces/components.
- Mermaid performance claims (mermaidcreator blog: >50 nodes slows; 20 more nodes = 3-5x slower) = low-quality source, unverified. mermaid-live-editor #891: 32 entries sluggish 200-400ms.

## Part C reads / tests
- READ mermaid-cli README: `mmdc -i in.mmd -o out.svg`; needs Puppeteer/Chromium (sandbox/docker caveats). Parse errors => nonzero exit (not shown on README; standard behaviour, verify before relying). Node API `run`.
- READ plantuml command-line page: new GNU-style flags `--check-syntax`, `--stop-on-error`, `-p/--pipe`, `--svg`; old name `-checkonly`/`-failfast` (old names from knowledge, not on fetched page).
- READ d2 man page summary: `d2 fmt`, `d2 validate`, `d2 layout`, `--layout`, `--sketch`, `--pad`; exit codes exist (details not read).
- READ ELK hierarchyHandling: INCLUDE_CHILDREN = one layout run across nested levels so cross-hierarchy edges route correctly; default SEPARATE_CHILDREN on root. => MUST set `elk.hierarchyHandling: INCLUDE_CHILDREN` for packages-with-classes where edges cross packages.
- TESTED (bench/c.mjs): @hpcc-js/wasm-graphviz SVG preserves user-supplied `id=` on nodes/edges/clusters (`<g id="e_A_B" class="edge">`), plus `<title>A->B</title>`, HTML-table class box rendered, onormal/odiamond emitted as polygons. => edge/node presence verification via DOM/regex is trivial in Graphviz; stable ids are the contract. Mermaid assigns its own ids (classId-Name-N, id_A_B_1 style; from knowledge, unverified here) so set-matching needs a parse of names.
- Not tested: mmdc, plantuml, d2 (not installed; no network install attempted).

---
# FINDINGS: comparison table (A)
Legend: CLI = headless from CLI; CDN = browser from CDN; Nest = nested containers; UML = notation fidelity; Route = edge routing.
(source: R = docs read this session, N = npm registry queried, K = my prior knowledge, unverified this session)

| Tool | Licence | CLI | CDN browser | Nest | UML fidelity | Routing | Size/interactivity |
|---|---|---|---|---|---|---|---|
| Mermaid classDiagram 12.x | MIT (N) | mmdc (needs Chromium) R | yes, jsdelivr/cdnjs K | namespaces, nested from 11.15 R | compartments, <<stereotype>>, all 6 arrows R. Per-member visibility ok. No packages-with-edges-to-package, no ports | ELK bundled & default (docs R), dagre alt; ELK engine gives edge-crossing-minimising layered | maxEdges 500, maxTextSize 50000 (R, schema). Static SVG; click needs securityLevel loose. No collapse. Perf degrades >~50 classes (low-quality source) |
| PlantUML | GPL/LGPL/Apache/EPL/MIT multi-licence K | java -jar; dot optional; smetana (pure Java dot port) R; ELK bundled since 1.2024.6 but "alpha" R | no (server-side; Kroki/plantuml server) | nested packages R | richest: all arrows, hide/show members, stereotypes, `together`, `remove`, `page` split R | dot orth via `skinparam linetype ortho` (K, ugly with labels); ELK alpha | Default PlantUML image limit 4096px (PLANTUML_LIMIT_SIZE; K) -> must set. Static |
| Graphviz dot (CLI) / @hpcc-js/wasm-graphviz 1.29.2 Apache-2.0 / @viz-js/viz 3.31 MIT | EPL (graphviz) K | `dot -Tsvg` | yes jsdelivr R | clusters (cluster_ prefix; edges to cluster via compound/lhead) | HTML-label tables = real UML compartments R; arrows onormal (hollow triangle), odiamond, diamond, dashed via style R/ tested | splines=ortho exists but label support poor (K); `concentrate=true` merges edges (K) | 600 nodes/1076 edges in 290 ms wasm (measured). SVG with ids (tested) -> easiest to verify & to wire interactivity. No built-in pan/zoom: add svg-pan-zoom (K) |
| D2 | MPL-2.0 (go binary) K; npm @terrastruct/d2 MPL-2.0 N | `d2` Go binary, `d2 validate/fmt` R | wasm npm pkg (@terrastruct/d2) exists N, CDN not verified | containers first-class R | `class` shape with +/-/# members R; arrowheads triangle/diamond(filled toggle)/circle/box/cf-* R; no automatic "dashed hollow triangle" preset; stereotypes via label | dagre (container limits) / ELK / TALA (proprietary, not bundled OSS - K) R | Good for overview diagrams; layout engines differ in container support R |
| ELK / elkjs 0.12.0 | EPL-2.0 OR GPL-3+ (N) | node | elk.bundled.js, web worker R | compound + hierarchical ports; INCLUDE_CHILDREN R | none (layout only; you draw SVG) | best-in-class layered w/ ORTHOGONAL, ports, edge labels K | 600 n / 1076 e orth in 693 ms (measured, flat) |
| dagre @dagrejs/dagre 3.1.1 | MIT N | node | yes | weak (cluster support limited, no cross-cluster edge routing K) | none | polyline/spline, no orth | 600 n 1078 ms (measured) |
| Cytoscape.js 3.34 + fcose 2.2 / elk 2.3 / dagre 4.0 / expand-collapse 4.1.1 | MIT all (N) | headless mode K | yes | compound nodes R | none built-in (style nodes yourself; arrowheads: triangle, triangle-backcurve, diamond (filled only? `tee`, `diamond`; hollow variants via fill white K)) | fcose = force (not for UML hierarchy); cytoscape-elk for layered | pan/zoom, collapse/expand with meta edges R (expand-collapse README says unmaintained R), search/click-to-focus easy (JS) |
| Structurizr DSL / Lite | DSL Apache-2.0 K; Lite Apache K | structurizr-cli export to mermaid/plantuml/dot R | Lite is a server | C4 model nesting | C4 only, NOT class diagrams | auto layout via Graphviz / manual | not appropriate for class level |
| LikeC4 1.59 | MIT N | `likec4 export png/svg`, `build` static site R | web component/React, vite plugin R | nested elements R | C4-style; no UML class | auto layout (graphviz wasm K) | drill-down view navigation; good for module overview/explorer; custom DSL |
| nomnoml 1.7 | MIT N | node | yes | nested classifiers [<package>...] K | compartments, <abstract>, <interface>; limited arrows (association, aggregation, composition, inheritance `-:>`, dependency) K | dagre-based | small diagrams only |
| yFiles | commercial K | no (JS lib; headless via browser) | no (licensed) | yes | custom | excellent orthogonal/hierarchic | out of budget; not verified |
| JointJS core 4.3 (MPL-2.0 N) | JointJS+ (commercial) has UML shapes K | browser | yes | embedding | UML shapes in the commercial pack | manual/ELK/dagre plug | |
| React Flow @xyflow/react 12.12 | MIT N | no | needs React build (esm.sh possible) | sub flows K | custom nodes | none (bring ELK/dagre) | great interactive nodes, but needs bundler; overkill for static HTML |
| Sprotty 1.4 | EPL-2.0 OR GPL-2.0+CPE N | no | TS framework, needs bundler | yes | custom | ELK integration (sprotty-elk) K | LSP-style diagrams; overkill |
| G6 5.1.1 / X6 3.1.8 | MIT N | no | yes (UMD) | combo (G6) K | custom | dagre/ELK plugins K | G6 combos with collapse/expand K; heavier docs, mostly Chinese-first |
| Kroki | MIT R | HTTP service / docker self-host R | n/a | per underlying engine | per engine | per engine | GET deflate+base64 (URL length caps) / POST; 30+ engines R; useful as ONE render entry point but adds a service dependency |

KEY TAKEAWAYS
1. Mermaid has the arrows & stereotypes but no way to control layout beyond ELK defaults, caps at 500 edges (default; raise via config), and has no collapse. Good for <= ~25 classes in a single package.
2. Graphviz (HTML-label class boxes + clusters) is the only open stack where (a) UML compartments, (b) exact arrowheads, (c) nested clusters, (d) stable ids in SVG, (e) CLI and wasm-in-browser from jsDelivr are all true. Weak points: orthogonal routing with labels; cross-cluster edges can balloon cluster sizes.
3. elkjs is the best layout engine for nested containers + weighted edges + ports, but you must draw (SVG you generate) — more code, more control, and the verification is trivial because YOU own the DOM.
4. Interactivity (collapse, focus, search) belongs in a JS graph lib (Cytoscape + expand-collapse, or own elkjs+SVG), not in diagram-as-code renderers.

# Part B: readability techniques (summary w/ source status)
- Multi-level (C4): System > Container > Component > Code; c4model.com says component diagrams "only if they add value", prefer automation; code level is optional (R). No numeric limits on those pages (R).
- Complexity limit: Moody's "manageable complexity" cites Miller 7±2 elements per diagram and prescribes modularisation + hierarchy (search snippet, not full paper read). Hard 7 is unrealistic for code; use as "per-level fan-out": <= ~7-9 packages in the top view or group the rest as "other".
- Purchase et al. (UML layout aesthetics; snippet only): fewer crossings 93%, fewer bends 91%, narrower 73%, orthogonality 61% preference; ordering crossings > bends > horizontal labels > joined inheritance arcs. Also: complexity (#classes, #lines) itself affects comprehension.
- Inheritance upward / generalisation arcs joined: layered layout with rank direction BT (Graphviz rankdir=BT) / ELK direction UP, and edge-kind-specific rank: inheritance/realization drive ranking, associations/dependencies don't (in dot: `constraint=false` on assoc edges; K).
- Aggregated/weighted edges: collapse package -> single node, edge weight = count of underlying dependencies; Sourcetrail "bundled edges with count" (R via search), cytoscape expand-collapse meta edges (R), Holten edge bundling for dense hierarchy views (R snippet).
- DSM: NDepend says graph doesn't scale; DSM does (R snippet); Lattix reads: partitions reveal layers & cycles, collapse hierarchy (R). Trade-off: lower accuracy on path tasks (study snippet). => Use DSM when package count > ~25-30 or edge density high; use node-link below. (threshold = my recommendation, not sourced)
- Hide members by default (IntelliJ toggles; Sourcetrail collapsed members with hidden-count) R.
- Focus/ego view: Sourcetrail shows only selected symbol + incoming/outgoing (R); IntelliJ "focus on immediate connections" (R).
- Filtering noise, transitive reduction, cycle highlighting: practiced (NDepend red cycles in DSM R snippet; Sonargraph cycle groups) ; transitive reduction on *dependency* graphs is common practice but I found no source stating thresholds (not verified). Never transitively reduce inheritance edges' truth: reduction must be only for display and be labelled.
- NOT found: numeric rules from CodeScene / CodeCharta / Structure101 (not read; no claims made).

# Part C: verification approaches
1. Graph-in vs SVG-out: give every node/edge a stable id (Graphviz keeps `id=`; tested) and assert set equality of ids from data vs DOM (jsdom or puppeteer). For aggregated edges assert the sum of weights equals underlying edge count.
2. Syntax lint: `mmdc` (parse error => fail; needs Chromium), `plantuml --check-syntax` / `-checkonly`, `d2 validate`, `dot -Tsvg` nonzero on error. (Mermaid parse in-browser: `mermaid.parse(text)`.)
3. Geometry checks in headless browser: for each text element getBBox() inside its container's bbox (clipping); pairwise bbox overlap for labels (O(n^2) fine for <=300); svg viewBox contains all bboxes; font-size on rendered scale >= 8-9px at 100% zoom (my threshold; not sourced).
4. Budget gate before render: node/edge counts per view; fail/split rather than render.
5. Visual regression (screenshot diff) only as a smoke test.
No published off-the-shelf "diagram vs graph" linter found (searched not exhaustively).

# RECOMMENDATION
(1) Package overview with nesting + weighted edges: elkjs layered (hierarchyHandling INCLUDE_CHILDREN, direction DOWN, orthogonal routing, edges aggregated to the visible level, stroke width/label = weight) rendered to own SVG inside an HTML page; fallback / diagram-as-code twin: Graphviz DOT with clusters (via @hpcc-js/wasm-graphviz from jsDelivr) or D2 containers. Alongside: a DSM table (HTML table/canvas) when >~25 packages.
(2) Per-package class diagram with correct arrowheads: Graphviz dot with HTML-label class boxes (rankdir=BT, onormal + dashed for realisation, odiamond/diamond for aggregation/composition, open arrow dashed for dependency), emitted as .dot plus SVG; optional Mermaid classDiagram twin (.mmd) for people who paste into docs, only when <= ~25 classes. PlantUML only if Java is acceptable and users want .puml.
(3) Interactive explorable HTML: Cytoscape.js (MIT, jsdelivr) with expand-collapse (meta edges) + cytoscape-elk or dagre layered for the layout, search box, click-to-focus (ego graph with N hops), members shown in side panel; OR own elkjs+SVG with the same behaviours. Use per-view data from the same JSON; each click triggers re-layout of a bounded subgraph.
Hard limits to enforce (my numbers, mixed sourcing): overview <= 30 package nodes (above: DSM or group "other"), <= 100 aggregated edges; class view <= 25 classes and <= 40 edges per diagram (practitioner ~17 per page; Mermaid maxEdges 500 is a ceiling not a goal); members hidden when > 12 classes, max 8 members shown per class; ego view radius <= 2 and <= 40 nodes; split by package, never emit one whole-repo class diagram; mark truncated views with "+N hidden" nodes so omissions are visible. 150 random nodes already yields a 13,405 px wide layout (measured), so the limit is readability, not compute time.

# NOT VERIFIED
mmdc/plantuml/d2 not installed or run; Mermaid ELK-default claim is from docs (v12), npm latest is 12.1.0, but class diagram behaviour untested; Purchase and Moody figures are from search snippets, not the papers (Eichelberger ScienceDirect 403; Kent PDF unreadable); licences of PlantUML, Graphviz, D2, Structurizr marked K; CDN availability of Mermaid/Cytoscape (jsdelivr) assumed standard; CodeScene, CodeCharta, Structure101, jQAssistant not researched; yFiles/JointJS+ not read; benchmark is random graphs without labels/clusters.
