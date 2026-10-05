# Research 2: deterministic extractors for class / module diagrams (2026-10-02)

Evidence tags: [READ] = fetched this session (page/README/PyPI JSON); [MEM] = from my background knowledge, NOT verified now.
Several WebFetch results are summaries from a small model, not raw docs; treat as secondary. Release dates for most tools were NOT obtained.

## JAVA

| Tool | Licence | Input | Relationships | Output | Granularity | Headless one-liner | Blind spots |
|---|---|---|---|---|---|---|---|
| jdeps (JDK) [READ man page JDK21] | GPLv2+CE (JDK) [MEM] | compiled .class/jar (needs build) | package, class, archive, module deps (any type reference in constant pool: fields, signatures, bodies, annotations). `--api-only`: only field types, params, returns, throws. Does NOT label the kind (extends vs field vs call) | text, `-dotoutput dir` (DOT + summary.dot) | class / package / jar / module | `jdeps -verbose:class -dotoutput out target/classes` | No edge kind; generics erased partly; reflection/DI invisible; zero install (ships with JDK) |
| javap (JDK) [MEM] | JDK | .class | full member dump incl. signatures, `-c` bytecode, `-v` constant pool | text | per class | `javap -p -s -c -cp target/classes X` | text only, must be parsed; use as supplement |
| ClassGraph [READ README summary] | MIT | bytecode, no class loading, no class init | extends, implements, annotations, fields/methods w/ `enableAllInfo()`, `getClassDependencyMap()` (all referenced types), `toJSON()` serialisation [MEM for API names] | Java API, JSON, DOT-ish graph | class / package | Library: needs ~10 lines of Java or jshell; no CLI out of the box | Needs compiled classes + classpath for full resolution; lambdas/invokedynamic partly; DI wiring only via annotations |
| ArchUnit [READ user guide] | Apache-2.0 [MEM] | bytecode via ClassFileImporter | access (field access/method call/ctor call), plus [MEM] inheritance, field type, param/return type, annotation deps via `JavaClass.getDirectDependenciesFromSelf()` (guide does not enumerate) | API only; PlantUML is INPUT (rules checked against component diagram), not generated | class/package | test code only; not a diagram extractor | Not an exporter; use it to VALIDATE a diagram's package edges against code |
| jQAssistant [READ plugin page] | GPLv3 | bytecode + jars + resources + META-INF/services | EXTENDS, IMPLEMENTS, DECLARES, DEPENDS_ON (type refs), INVOKES, READS/WRITES (field), annotations, records/enums; Spring plugin adds beans/injection [MEM] | Neo4j graph; query with Cypher; reports | class/package/artifact | `mvn jqassistant:scan jqassistant:analyze` or CLI; embedded Neo4j, JDK 17+ for Neo4j5 | Heavy (graph DB); Cypher needed to export; GPL; reflection invisible |
| JavaParser + SymbolSolver [READ README] | LGPL-3 OR Apache-2 | SOURCE (no build) | AST of everything; with solver resolves type refs to FQNs (extends, implements, field/param/return types, generics args, annotations, call targets). v3.28.2, Java 1-25 | AST -> JSON via javaparser-serialization; you write the walker | any | Library; need a ~100-line Java/Kotlin driver | Solver needs source roots + dependency jars on classpath, otherwise UnsolvedSymbolException; Lombok-generated members absent; slow on big repos |
| Spoon (Inria) [READ README] | CeCILL-C + MIT dual | SOURCE (+ optional classpath; noclasspath mode [MEM]) | full typed model (CtType, CtTypeReference): extends, implements, fields, params, returns, generics, invocations, annotations. 11.x needs JDK17+, supports to Java 25 | Java API only (JSON/PlantUML yourself) | any | Library; driver needed | Lombok: can run annotation processing only with extra config [MEM]; unresolved types in noclasspath |
| Eclipse JDT / jdt-ls [MEM] | EPL-2.0 | source (+ classpath, via Maven import) | bindings -> complete resolved model incl. LSP documentSymbol/references/typeHierarchy | LSP JSON-RPC | any | Very heavy (Eclipse runtime, Maven import) | LSP is per-query, not a graph dump; poor skill fit |
| UMLDoclet [MEM] | Apache-2.0 | source via javadoc | class diagrams in PlantUML: extends, implements, fields, methods, associations (field refs) | PlantUML + javadoc HTML | per class/package | `mvn javadoc:javadoc` with doclet config | Needs Javadoc to run (fails on doc errors with older versions); Java 17 support was lagging [MEM unverified] |
| plantuml-generator / java2plantuml-style [MEM] | various | source or bytecode | mostly extends/implements/fields | PlantUML | class | varies | small projects, uneven upkeep; not verified |
| Structurizr + component finder [MEM] | Apache-2.0 (structurizr-java) | bytecode via classgraph-like scanning, Spring strategies | components = Spring-annotated types, dependencies = type refs; C4 model | Structurizr DSL/JSON -> PlantUML/Mermaid | component | Library | C4-level only, not UML class diagrams; component finder was deprecated/removed in later versions [MEM, unverified] |
| Spring Modulith Documenter [READ docs] | Apache-2.0 [MEM] | compiled classes (`ApplicationModules.of(App.class)`), run from a @Test | module boundaries (direct sub-packages of the app package), module->module deps with type (entity ref, event listener, injection...) [MEM], C4 or UML component PlantUML | PlantUML (+ all-docs.adoc), under target/spring-modulith-docs | module (+ individual module with deps) | `mvn test` with a small test class | Only for Spring Boot apps with modules-as-packages; needs dependency added to the project; module level only; "exactly this Spring Boot project" not general |
| maven/gradle dependency-graph plugins [MEM] | | pom/build | artifact level only (not class level) | DOT/JSON/text | artifact | `mvn dependency:tree -DoutputType=dot` | Third-party jar graph, not code structure |
| IntelliJ diagram export [MEM] | proprietary (Ultimate) | IDE | class UML | PNG/SVG/puml via UI | class | NOT headless | Not usable by a skill |
| Sokrates [MEM] | MIT | source | metrics, component deps, dependencies by package | HTML/JSON reports | file/component | Java jar CLI | Heuristic text-based dependency detection; less precise |
| Class Visualizer [MEM] | ? | | | | | | Not verified; skipped |
| depends (multilang-depends) [READ README] | MIT | SOURCE (Java, C/C++, Ruby, Python, Maven POM) | Call, Cast, Contain, Create, Extend, Implement, Import, Mixin, Parameter, Return, Throw, Use, ImplLink; file or method granularity | JSON, XML, Excel, DOT, PlantUML | file / method | `java -jar depends.jar java src out -f json -d outdir` (release jar needs JRE) [MEM for flags] | Heuristic resolution (no full classpath); Python support weaker; Java without classpath fine because of explicit imports |

## PYTHON

| Tool | Licence | Input | Relationships | Output | Notes / blind spots |
|---|---|---|---|---|---|
| pyreverse (ships in pylint) [READ pylint repo; pylint docs page returned only a TOC] | GPLv2 | source (astroid), imports modules | inheritance, composition/aggregation/association from attribute assignments (`self.x = Foo()`) and type annotations (annotation support added in 2.x, [MEM]), packages diagram w/ imports | `-o dot/puml/plantuml/mmd/html/png/svg`, `-p name`, `-A` all ancestors, `-S` all associated, `-m y` show modules [MEM option list] | `pyreverse -o mmd -p proj src/pkg`. Needs `pip install pylint` (+graphviz only for dot->png). Blind spots: duck typing, dynamic attrs, method-param deps not shown, big diagrams noisy. Pylint 4.1.1 current [READ] |
| py2puml | MIT [READ PyPI] 0.11.0, 2026-02-18 | importlib + AST: imports the modules (executes imports!) | inheritance, composition from dataclass / typed class attributes, `__init__` annotated assignments | PlantUML (and mermaid via flag [MEM]) | `py2puml src/pkg pkg`. Needs annotated attrs; no method-level deps; imports code so env must install |
| pydeps | BSD-2 [READ PyPI] 3.0.9 (Jan 2024; may be stale) | bytecode opcodes of imported modules | module import graph only | DOT/SVG/JSON (`--show-deps` JSON [MEM]) | `pydeps pkg --show-dot --noshow` requires graphviz `dot` for SVG; dynamic imports missed |
| grimp | BSD-2 [READ PyPI; reported 3.17 / 2023-08-18, looks inconsistent with current 3.x - UNVERIFIED] | AST static imports | module import graph, queries (chains, layers, cycles); `include_external_packages` | Python API (`grimp.build_graph("pkg")`), no CLI | foundation of import-linter; dynamic `importlib` missed |
| import-linter [MEM] | BSD-2 | grimp | contract checks (layers/forbidden/independence) | text | validate, not draw |
| tach [READ README] | MIT, Rust core, active (2,474 commits) | static imports vs `tach.toml` modules | module deps, public-interface violations, cycles | `tach map` JSON, `tach show` DOT (tach_module_graph.dot), `tach report` | needs a tach.toml (`tach init`) |
| pyan / code2flow [MEM] | GPL-2 / MIT | source | call graph (pyan3 also uses/defines) | DOT/SVG/HTML | approximate; dynamic dispatch missed; pyan3 maintenance sporadic |
| snakefood [MEM] | GPL | source | import graph | | Python 2 era, unmaintained |
| astroid / jedi / pyright [MEM] | LGPL / MIT / MIT | source | astroid: inference engine (what pyreverse uses). pyright `--outputjson` gives diagnostics, not a graph; pyright has `--verifytypes` JSON of symbols | | build your own walker with stdlib `ast` + (optionally) astroid. Stdlib `ast` is zero-install and enough for classes, bases, annotated fields, imports |
| scip-python [READ README] | see repo LICENSE (MIT-like, Pyright fork) [MEM] | source + installed env (pip) | symbol defs/refs, relationships (implementation) | SCIP protobuf | Node>=16 + Python>=3.10; `npm i -g @sourcegraph/scip-python; scip-python index . --project-name X`; needs protobuf decode (`scip print --json`) |

## TS/JS
- dependency-cruiser [READ README]: MIT, 7.2k stars. Module (file/folder) import graph for ES6/CJS/AMD, TS, JSX/TSX, Vue, Svelte; JSON, DOT, Mermaid, CSV, HTML. `npx depcruise src --output-type json` [MEM flag]. Blind spots: dynamic import expressions with variables, type-only imports toggle (`tsPreCompilationDeps`), no class level.
- madge [MEM]: MIT, import graph, JSON/DOT/SVG, `npx madge --json src`. File level only.
- ts-morph [MEM]: MIT, full TS compiler API wrapper; class/interface/extends/implements/property types/params all resolvable; needs a driver script + tsconfig. Best class-level source for TS.
- tsuml2 [MEM]: class diagrams from TS via ts-morph -> SVG/DOT/mermaid-ish; small project, maintenance unverified. arkit [MEM]: architecture diagrams from imports, PlantUML out; stale-ish.
- Not verified individually: tsuml2, arkit, madge (no fetch).

## POLYGLOT
- tree-sitter [MEM]: MIT. Concrete syntax trees for 100+ languages; `tags.scm` queries yield definitions/references (names only, no resolution); `tree-sitter` CLI or py-tree-sitter bindings. No type resolution -> extends/implements by name only, imports by string. Good LAST-resort source fallback. stack-graphs [MEM]: GitHub's name-resolution on tree-sitter; the repo was archived in 2025 [MEM, verify].
- SCIP [READ]: Apache-2.0; indexers: scip-java (Java/Scala/Kotlin; needs build tool compile, [MEM] `scip-java index` auto-detects Maven/Gradle), scip-typescript, scip-python, scip-clang, scip-ruby, scip-dotnet, rust-analyzer, scip-dart, scip-php. Schema: Index > Document > Occurrence (range, symbol, symbol_roles) + SymbolInformation (symbol, documentation, relationships: is_reference / is_implementation / is_type_definition / is_definition). `scip print --json` converts. Gives symbol-level def/ref (so "who references class Foo" is complete and compiler-accurate) but it is occurrences, not typed edges: you derive field-type/extends edges from relationships + enclosing definition ranges. scip-java page itself failed to fetch (404) - details [MEM]. LSIF is the predecessor (JSON lines, vertices/edges), superseded by SCIP [MEM].
- Emerge [READ]: MIT, v2.0.0, pip `emerge-viz` (+graphviz) or Docker; `emerge -c config.yml`; languages parsed: C, C++, Groovy, Java, JS, TS, Kotlin, ObjC, Ruby, Swift, Python, Go; entity extraction for Java/Kotlin/JS/TS/Groovy/Swift; export GraphML, JSON, tabular, D3/HTML. File-level imports; regex/heuristic parsing (not type resolved) [MEM].
- CodeQL [MEM]: proprietary query lang, free for OSS; needs DB build (compiles Java); most complete (data-flow, calls, types); `codeql database create` + `codeql query run`/`bqrs decode --format=json`. Heavy; licence restricts commercial private-repo use.
- Joern [MEM]: Apache-2.0, CPG; Java (via bytecode/Soot or javasrc2cpg), Python (pysrc2cpg), JS, etc.; `joern-parse` + `joern-export --repr all --format graphml|neo4csv|dot`. Heavy JVM tool, rich edges (AST, CALL, REF, INHERITS_FROM...). Strong polyglot candidate but big install.
- Sourcetrail forks (NumbatUI / CE) [MEM]: GUI-centric, Sourcetrail was archived 2021; SQLite DB output exists but Java indexer is fragile. Skip.
- ctags (universal-ctags) [MEM]: GPLv2; `ctags --output-format=json --fields=+iKnSz -R`; definitions + `inherits:` field for classes in many languages; no references. Cheap fallback giving class + inheritance.
- Doxygen [MEM]: GPL; XML + dot; supports Java/Python/C++ etc.; `<basecompoundref>`, `<collaborationgraph>`; good for C/C++, mediocre for Python. Source only, no build.
- srcML [MEM]: GPLv3; source -> XML; syntactic only.
- Semgrep / ast-grep [MEM]: LGPL / MIT; pattern-based search; `ast-grep run -p 'class $A extends $B' --json`; good for targeted gap checks (e.g. find all @Autowired), not a graph.
- Kythe [MEM]: Apache-2.0; heavy (Bazel-oriented), graph store of nodes/edges (ref, defines/binding, extends, param...). Skip.
- Moose/Famix [MEM]: Pharo; FamixJava via VerveineJ (Java source -> MSE/JSON); academic, heavy. CodeCharta [MEM]: metrics visualisation (treemap), not a dependency graph. code-maat [MEM]: git-log mining (coupling/hotspots), not static structure. Neither suits class diagrams.

## Neutral intermediate graph schema (convergent shape)
Observed/recalled across tools: a list of nodes with stable id + kind + name + container, and a list of edges with source, target, kind (+ optional multiplicity, location).
- depends JSON [READ README only; field names MEM]: `{"variables":[files...], "cells":[{"src":0,"dest":1,"values":{"Call":3,"Import":1}}]}` -> matrix of counts per relation.
- jQAssistant: nodes labelled `:Java:Type:Class`, rels `EXTENDS, IMPLEMENTS, DECLARES, DEPENDS_ON{weight}, INVOKES, READS, WRITES`.
- Joern/CPG: nodes TYPE_DECL, METHOD, MEMBER, CALL; edges AST, CALL, INHERITS_FROM, REF.
- SCIP: Document/Occurrence/SymbolInformation/Relationship [READ].
- Emerge GraphML/JSON: file nodes + import edges with metrics.
- Suggested skill schema: nodes `{id (FQN), kind: class|interface|enum|record|annotation|module|package, name, package, modifiers, stereotypes[] (Spring @Service...), fields[{name,type,typeArgs[]}], methods[{name,params[{type}],returns,throws}], file, line}`; edges `{from, to, kind: extends|implements|field|param|return|creates|calls|imports|annotates|injects|depends, via (member name), multiplicity, evidence{file,line}, confidence: resolved|name-matched}`. Keep evidence per edge so the diagram step can be checked against it.

## RANKING

### Java (Spring Boot, Maven, 17/21)
1. **Bytecode, if `target/classes` exists (or `mvn -q compile` is allowed): jdeps for package/class dependency edges (zero install, ships with JDK, DOT) + javap/ClassGraph for member signatures + kinds.** jdeps alone has no edge kinds, so combine. Best completeness/install ratio: all type references incl. method bodies are present in bytecode, generics' type args are in Signature attributes (jdeps/javap show them; ClassGraph exposes them).
2. **Source: JavaParser + SymbolSolver or Spoon** (typed edges extends/implements/field/param/return/generics/annotations, no compile needed) via a small driver; best for typed UML. Needs source roots + dependency jars for resolution, else fall back to name-matching imports. Lombok members must be reconstructed from annotations.
3. Module level for Spring: Spring Modulith Documenter if the project already uses it; otherwise derive packages with jdeps `-verbose:package`.
4. depends (single jar, MIT, 13 relation kinds, PlantUML/JSON) as a "one command on raw source" option.
5. Heavy but rich: jQAssistant, scip-java, CodeQL, Joern.
Fallback chain: compiled classes -> jdeps + ClassGraph/javap; else try `mvn -q -DskipTests compile` (ask); else JavaParser/Spoon; else depends; else ctags/tree-sitter (names + inheritance only) ; else ast-grep/grep for `extends|implements|@Autowired|import`. Always report which tier ran and which edge kinds are unavailable.
Blind spots to state in output: Spring DI wiring is only visible through annotations/constructor types (bean resolved by interface -> implementation not linked unless you add edges); reflection, `@Bean` factory returns, lambdas/invokedynamic targets, Lombok (@RequiredArgsConstructor creates injection ctor not in source; bytecode has it), records (ok in bytecode/JavaParser), inner/anonymous classes (`Outer$Inner` naming), generics type args.

### Python
1. **stdlib `ast` own walker (zero install) for classes, bases, annotated attributes, `self.x: T`, imports, + `pyreverse` (pip pylint) for ready diagrams** with inheritance/composition. pyreverse is the single-command best for class diagrams; py2puml is cleaner for typed data models but imports the code.
2. Package/module: grimp (Python API, precise static import graph) or pydeps (bytecode-based, DOT/JSON; needs graphviz for images) or tach (`tach map` JSON; needs tach.toml).
3. Accurate references: scip-python (Node + pyright) if available.
Fallback: pyreverse -> py2puml -> own `ast` walker -> ctags/tree-sitter -> grep. Blind spots: duck typing, untyped attributes, `importlib`/`__import__`, plugin entry points, decorators-based wiring (FastAPI Depends), metaclass magic, `TYPE_CHECKING` imports (grimp can include/exclude).

### TS/JS
dependency-cruiser (modules, JSON) + ts-morph driver for class/interface edges; madge as light alternative; scip-typescript for precise refs.

### Polyglot
Tier 1 if compiled/available: SCIP indexers. Tier 2: Joern (graph export) or depends/Emerge for file-level. Tier 3: universal-ctags JSON (+ tree-sitter queries) for definitions and `inherits`. Tier 4: ast-grep / grep.

## Could not verify / caveats
- No last-release dates or commit recency obtained except: py2puml 0.11.0 (2026-02-18), pydeps 3.0.9 (2024-01-22), JavaParser 3.28.2, Pylint 4.1.1 docs, Emerge 2.0.0. grimp PyPI summary returned version 3.17 / 2023 which looks wrong or stale; recheck.
- Not fetched at all (marked MEM): javap, UMLDoclet, plantuml-generator, Structurizr, Sokrates, ts-morph, tsuml2, arkit, madge, tree-sitter, stack-graphs, CodeQL, Joern, Sourcetrail, ctags, Doxygen, srcML, Semgrep, ast-grep, Kythe, Moose, CodeCharta, code-maat, pyan, code2flow, snakefood.
- scip-java docs page 404; ArchUnit guide did not enumerate dependency kinds; pylint pyreverse doc page returned only a TOC (pyreverse option list is MEM).
- Fetch tool output is model-summarised, so exact flags quoted from [MEM] should be tested before baking into a skill.
