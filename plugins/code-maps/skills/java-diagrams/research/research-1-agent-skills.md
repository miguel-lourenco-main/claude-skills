# Research 1: AI-agent-side prior art for code -> class/module diagrams (2026-10-02)

Method note: stars/licence/pushed_at come from api.github.com on 2026-10-02 (unauthenticated). "READ" = I read the README/doc text; "SNIPPET" = only seen in a search result. No SKILL.md of the Mermaid/PlantUML/C4 skills below does static analysis; I confirmed that for WH-2099 (READ SKILL.md) and inferred it for the rest from READMEs (stated per row).

## A. Hybrid / grounded tools (static facts first, LLM second) - most relevant

| Item | Type | Licence / activity | Facts come from | Output | Large repos | Weaknesses | Evidence |
|---|---|---|---|---|---|---|---|
| CodeBoarding https://github.com/CodeBoarding/CodeBoarding | CLI + VS Code ext + GH Action + SaaS | MIT, 2.5k stars, pushed 2026-10-02 | LSP servers (downloaded per language) extract symbols and call/ref graph; LLM only names/describes components ("Static analysis extracts code relationships; language models help name and describe the components") | analysis.json; Mermaid md, HTML, MDX, RST; web viewer | Hierarchical: nested component diagrams, depth ceiling, incremental updates by component | Needs Python 3.12, Node, LSP binaries, and an LLM key; code excerpts sent to provider; component-level only (its own sample output is a 8-node component graph, not a class diagram); Java/Python/TS/Go/PHP/Rust/C#/JS | READ README |
| Code2UML (paper, Claude Agent SDK) https://arxiv.org/abs/2605.24453 | research prototype | arXiv 2026-05; no repo seen | Tree-sitter extractors -> language-agnostic JSON IR; deterministic importance-weighted IR compaction (no LLM) makes a per-diagram-type view that fits context; LLM agents (Planner/Analyzer/Diagram/Corrector/DependencyAnalyzer) emit PlantUML; Corrector validates | PlantUML, 7 UML types | Compaction by importance score; tested 31 to 4,578 IR entities, quality stable | 12 repos x 4 langs (Java, JS, PHP, Python), 84 observations: syntax validity 91.5%, relationship precision 0.858 (i.e. ~14% of edges not in IR = hallucinated), entity recall only 0.313 (deliberately incomplete). Activity diagrams had failure modes the corrector could not fix | READ full text (pdftotext) |
| llm-diagrams https://github.com/cedric-albeke/llm-diagrams | CLI | MIT, 0 stars, pushed 2026-03-24 (tiny, unproven) | dependency-cruiser import graph + ts-morph exports; barrel-export resolution; optional 2-agent LLM (File Analyst + Architect) grouping with "6-layer hallucination prevention"; `--validate-only` checks no hallucinated nodes; ELK.js layout | Mermaid, Excalidraw, SVG/PNG | Static mode groups by directory; LLM mode groups semantically | TypeScript only; unproven; I did not read the 6 layers | READ README top section |
| Understand-Anything https://github.com/Egonex-AI/Understand-Anything (moved from Lum1104/) | Claude Code plugin (multi-agent), also Cursor/Copilot | MIT, ~85k stars (per WebFetch of README; not independently checked via API) | Tree-sitter structural facts (imports, defs, calls, inheritance) then LLM adds summaries, layers, tours; graph-validation agent step | Interactive knowledge-graph web UI (not Mermaid/UML) | Scope to subdirectory (`/understand src/frontend`); incremental re-runs on changed files | Heavy token use on first run; graph explorer not a committed diagram; not class-diagram oriented | READ via WebFetch summary of README |
| codebase-memory-mcp https://github.com/DeusData/codebase-memory-mcp | MCP server, single C binary | MIT, 45.7k stars, pushed 2026-10-02 | tree-sitter for 162 languages + "Hybrid LSP" type resolution for 11 incl. Java and Python; SQLite graph; Louvain community detection | Query results (`get_architecture`: packages, entry points, routes, hotspots, layers, clusters), Cypher, 3D UI. No Mermaid export found (grep: none) | Clustering via Louvain; single-call overview | Java rated "Good (75-89%)" in its own benchmark of resolution quality - i.e. edges are not guaranteed complete; no diagram output | READ README (grep + sections) |
| CodeGraph https://github.com/colbymchenry/codegraph | MCP server + CLI, Rust kernel | MIT, ~72.9k stars (as returned by API), pushed 2026-10-02 | tree-sitter, SQLite graph, 20 languages incl. Java/Python; 30+ tools; DOT/Mermaid/GraphML/Neo4j CSV export per third-party listing | Mermaid, DOT, GraphML, HTML viewer | depth / max_nodes params (per snippet) | Mermaid export claim is from mcpserver.space snippet - the README I fetched has no "mermaid" string; benchmark is about agent token savings, not diagram correctness | READ README (grep); Mermaid claim SNIPPET only. Possibly confusable with other "codegraph" repos (sdsrss/code-graph-mcp MIT 83 stars; CodeGraphContext) |
| CodeGraphContext https://github.com/CodeGraphContext/CodeGraphContext | MCP + CLI | MIT, 4.2k stars, pushed 2026-09-29 | tree-sitter; optional SCIP indexers (scip-clang, scip-dotnet, others) for more accurate calls and inheritance; Kuzu/Neo4j | graph DB queries, interactive web graph explorer | graph DB | SCIP only for some languages and needs build files (compile_commands.json, .csproj) | READ README |
| Serena https://github.com/oraios/serena | MCP toolkit | licence NOASSERTION in API, 29.9k stars, pushed 2026-09-30 | LSP (semantic symbol lookup, references) | none - not a diagram tool; useful as fact source | n/a | SNIPPET/description only | description only |
| SCIP / LSIF MCP evaluations e.g. https://github.com/MrityunjayBhardwaj/anvi/issues/598 | issue | - | SCIP indexer as structure-graph extractor | - | - | SNIPPET only | not read |

## B. LLM-reads-code diagram products

| Item | Type | Licence / activity | Facts come from | Output | Large repos | Weaknesses |
|---|---|---|---|---|---|---|
| GitDiagram https://github.com/ahmedkhaleel2004/gitdiagram (+ remote MCP https://gitdiagram.com/mcp, Claude plugin `/gitdiagram` skill) | SaaS + MCP + plugin | MIT, 17.7k stars, pushed 2026-10-02 | LLM reads file tree + README + bounded source excerpts (favours "substantive runtime modules", keeps import bindings for sampled calls). Not static analysis. | Mermaid via deterministic compiler from a validated JSON graph (groups/nodes/edges/paths) | Bounded excerpt of tree/files; partial tree handling for huge repos | Architecture-level only, not class diagrams. Edges are LLM judgement over samples. BUT its validation design is worth copying: LLM emits strict graph AST; server validates ids, connectivity, limits and that every linked path exists in the repo; retries with focused feedback; compiler (not LLM) writes Mermaid with escaping. READ docs/architecture.md |
| Swark https://github.com/swark-io/swark | VS Code extension | AGPL-3.0, 1.7k stars, last push 2025-03-21 (dormant) | LLM (Copilot) reads selected files; README explicitly sells "all the logic is in the LLM" | Mermaid | file-folder selection only; no clustering | AGPL; no verification; dormant; exactly the failure mode of the previous attempt. READ README |
| DeepWiki-open https://github.com/AsyncFuncAI/deepwiki-open | self-host wiki generator | MIT, 18.1k stars, pushed 2026-09-03 | RAG over code + LLM-written pages with Mermaid | Mermaid in wiki pages | wiki pages per module | README is thin (read); diagrams LLM-authored, no verification described |
| Repomix https://github.com/yamadashy/repomix | CLI packer | MIT, 28.7k stars | packs repo to one file for LLM context (has tree-sitter `--compress` signature mode per its docs - not verified here) | n/a - input to an LLM | - | not a diagram tool. SNIPPET/description only |
| Swark-like "Excalidraw architecture skill" https://medium.com/@ooi_yee_fei/custom-claude-code-skill-auto-generating-updating-architecture-diagrams-with-excalidraw-431022f75a13 | blog | - | LLM reads code | Excalidraw | - | SNIPPET only |

## C. Claude skills / plugins that generate diagrams (all LLM-reads-code; none run a parser)

| Item | Licence / activity | What it does | How facts obtained | Notes |
|---|---|---|---|---|
| WH-2099/mermaid-skill https://github.com/WH-2099/mermaid-skill | MIT, 288 stars, pushed 2026-08-11 | /mermaid, 23 diagram types, synced Mermaid syntax docs in references/ | None: "Understand requirements -> read syntax ref -> generate"; allowed-tools Read Write Edit; no render or lint step | READ SKILL.md. Useful only as syntax reference pattern (reference-per-diagram-type, weekly doc sync) |
| SpillwaveSolutions/plantuml https://github.com/SpillwaveSolutions/plantuml | 57 stars, pushed 2026-08-24; README badge says MIT, API licence None | PlantUML skill; "convert source code to diagrams" (Spring Boot, FastAPI examples); scripts: check_setup.py, convert_puml.py, process_markdown_puml.py --validate (needs Java, Graphviz, plantuml.jar) | LLM reads code; the scripts only render/validate syntax | READ README. Good pattern: render+validate scripts bundled in skill |
| arjunprabhulal/reverse-engineer-skills https://github.com/arjunprabhulal/reverse-engineer-skills | MIT, 0 stars, pushed 2026-08-04 | Whole-repo docs + Mermaid arch/flow diagrams + audit; every claim carries `file:line` citation | LLM reads code, with mandatory citations | READ README. Citation requirement is a cheap verifiable-claim mechanism |
| DavidROliverBA/Daves-Claude-Code-Skills https://github.com/DavidROliverBA/Daves-Claude-Code-Skills | MIT, 73 stars | architecture/diagramming skill set (dependency graph in Mermaid etc.) | LLM | README fetched, not studied in depth |
| Cocoon-AI/architecture-diagram-generator, konraddzbik/architecture-diagram-skill | - | HTML/SVG dark-themed architecture visuals | LLM | SNIPPET only |
| mcpmarket / claudedirectory / skills-hub "diagram", "Diagram Generator" ("C4 context+container, module dependency graphs") | - | marketplace listings | LLM | SNIPPET only; I did not open any SKILL.md - cannot confirm they use tools |
| lttr/codebase-to-diagram (c4-diagram skill) | 0 stars | C4 via skills.lc listing | - | SNIPPET only |
| Working Software blog, C4 via Claude Code + Structurizr DSL https://www.workingsoftware.dev/ai-assisted-software-architecture-generating-the-c4-model-and-views-directly-from-code/ | blog | LLM scans codebase -> Structurizr DSL -> playground | LLM | READ via WebFetch: author's own caveats - first version put all containers in one view ("doesn't make sense"), "code doesn't tell the whole story", needs user to scope views, manual validation. Same unreadable-overview failure as ours |

Registry check: skills.sh / anthropics/skills searches surfaced nothing class-diagram-specific that wasn't in the list above (searches were via web search, not by browsing the registries directly - not exhaustive). No skill found that runs a Java parser (javaparser, jdeps, jQAssistant, PlantUML doclet) or pyreverse. That is a real gap, not a search miss I can prove.

## D. Evidence on accuracy and what improves it

- Code2UML (above): LLM with deterministic IR still hallucinates ~14% of edges and covers 31% of entities; the paper frames the low recall as intentional prioritisation. Context compaction done outside the LLM is their key technique. READ.
- "UML Class Diagram Evaluation and Repair Strategies based on LLMs" https://arxiv.org/abs/2608.28800 (abstract READ): LLM-produced class diagrams show incomplete key classes, confused/omitted relationships, missing inheritance, unused classes, circular dependencies. Repair strategies: memory reinforcement, external knowledge injection, detection-guided targeted repair. Reported repair rates: key class 85%, coupling relationship only 46% (inheritance figure truncated in the abstract I saw). So relationship recovery is the weak spot - matches the user's experience.
- "Using LLMs to extract UML class diagrams from Java and Python" https://ceur-ws.org/Vol-4122/paper12.pdf (SNIPPET only): five open LLMs, accuracy/F1 higher for Python than Java.
- Query2Diagram https://arxiv.org/abs/2604.23816 (abstract READ): full reverse-engineering tools "produce overwhelming detail without considering developer intent"; proposes query-focused diagrams in a structured JSON, evaluated for structural defects. Supports "diagram per question/scope", not one global diagram.
- NOMAD https://arxiv.org/abs/2511.22409 (abstract READ): requirements-to-UML, not code; relevant for its error taxonomy (structural / relationship / semantic) and finding that LLM self-verification has mixed effects.
- Layout/readability: Sun & Wong, "On Evaluating the Layout of UML Class Diagrams for Program Comprehension" (PDF fetched, abstract READ): layout quality (perceptual criteria) matters as much as correctness; tools that ignore it leave users rearranging boxes. Old (c. 2005) but is the source for why a huge flat class diagram fails.
- Not found: any controlled benchmark of Claude/skill-generated architecture diagrams against ground truth for Java/Spring. Could not verify claims by vendors (CodeBoarding, Understand-Anything) about accuracy; none publish precision/recall of edges.

## E. Patterns across the field

1. Every serious tool separates fact extraction (tree-sitter / LSP / SCIP / dependency-cruiser) from LLM work, and restricts the LLM to naming, grouping, summarising.
2. Overview is made readable by hierarchy (CodeBoarding nested components, Louvain clusters in codebase-memory-mcp, scope-to-subdir in Understand-Anything, per-query diagrams in Query2Diagram), never one flat graph.
3. Validation is deterministic: structured graph output -> check ids/paths/connectivity -> compile to Mermaid by code (GitDiagram), Corrector agent + regex parser (Code2UML), `--validate-only` (llm-diagrams), PlantUML syntax validation script (Spillwave).
4. Pure LLM-reads-code skills (all the marketplace Mermaid/PlantUML/C4 ones, Swark) have no correctness mechanism; that matches the failed previous attempt.
5. Tree-sitter-only graphs are syntactic: call/type resolution is approximate (codebase-memory-mcp rates Java 75-89%); SCIP/LSP resolve better but need build setup.

## F. What a new skill should borrow / avoid

Borrow
- Facts-first pipeline: a deterministic extractor script (bundled in the skill) produces a JSON IR of classes, relations (extends/implements/field/param/injection/annotation) and package/module edges. For Java: javaparser, or jdeps/bytecode for package edges; Python: ast/pyreverse/pydeps; or tree-sitter for generality. The LLM never types an edge that is not in the IR.
- LLM emits a constrained graph spec (JSON: groups, nodes, edges referencing IR ids), validator rejects unknown ids/paths and reports edges dropped; a plain script compiles it to Mermaid/PlantUML (GitDiagram, Code2UML).
- Completeness check as a script: coverage report of IR entities/edges vs. diagram (Code2UML's entity recall / relationship precision metrics) so "missing relationships" become a number, and edges omitted by aggregation are shown as aggregated counts, not silently dropped.
- Deterministic context compaction / importance ranking (fan-in/out, centrality, Louvain community) to choose what appears at each level (Code2UML, codebase-memory-mcp).
- Multiple levels: module/package overview (aggregated edges with weights), then one class diagram per package or per query/scope (CodeBoarding, Query2Diagram, C4 blog's warning about one giant view).
- Render-and-lint step in the skill (mermaid-cli or plantuml.jar `--validate`), plus cycle/orphan checks; `file:line` citations on descriptions (reverse-engineer-skills).
- Keep syntax reference files per diagram type (mermaid-skill) and diagram-as-code outputs committed beside the code.
- Optionally use an existing graph MCP (CodeGraph, CodeGraphContext, codebase-memory-mcp, Serena) as the fact source when installed, but do not depend on it: none gives guaranteed-complete Java edges.

Avoid
- Letting the LLM read files and draw edges directly (Swark, generic Mermaid/PlantUML skills): ~14% invented edges and low recall even with a good IR (Code2UML), worse without.
- One flat diagram for the whole repo; cap nodes per diagram and split.
- Treating tree-sitter call graphs as ground truth for dependency injection / Spring wiring; annotation- and bean-based edges need explicit extraction rules.
- Copying AGPL code (Swark) or heavy SaaS dependencies; building on tools requiring API keys when the agent itself is the LLM.
- Claiming accuracy without measuring: no vendor publishes edge precision/recall; the new skill should self-report it.

## Blockers / unverified
- skills.sh and anthropics/skills not browsed directly; marketplace listing rows are snippet-level.
- Understand-Anything star count unverified by API (repo moved; API call on old name returned "Moved Permanently").
- CodeGraph Mermaid export unverified in README. Star counts of colbymchenry/codegraph and Understand-Anything look unusually high; reported as returned.
- 6-layer hallucination prevention in llm-diagrams not inspected.
- Follow-ups outside my slice: classic non-AI generators (pyreverse, PlantUML doclet, jQAssistant, Structurizr, Doxygen, depcruise) for the static layer.
