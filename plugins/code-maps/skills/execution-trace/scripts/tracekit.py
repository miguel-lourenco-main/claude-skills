#!/usr/bin/env python3
"""tracekit — the parts of a run-trace builder that are the same for every project.

A project's own builder (start from templates/build_trace.py) imports this file, describes the
steps of one run, and calls write_page(). What the kit guarantees:

  * an excerpt is CUT from the source at an anchor line, and the build stops if the anchor is gone,
    so no excerpt drifts silently and none is typed by hand                      (Repo)
  * an arrow between two classes is a call found in the compiled bytecode       (Bytecode)
  * a class is drawn in a step only if the JVM loaded it in a measured run      (Loaded)
  * the data is checked before a page is written: no arrow to a missing box, no key-class
    arrow that the bytecode does not show, one phrase per box                    (validate)

    python3 tracekit.py validate trace-data.json     # check a data file on its own
    python3 tracekit.py selftest                     # the kit's own checks, no project needed

Python 3.9+, standard library only. Bytecode needs `javap` (any JDK) and compiled classes.
"""
import collections
import json
import os
import re
import subprocess
import sys

MARKER = "/*FLOW_DATA*/null"
PHRASE_MAX = 64          # one phrase per box: longer than this is a sentence, and belongs in the detail


def die(msg):
    sys.exit("tracekit: " + msg)


# ── reading the repository ───────────────────────────────────────────────────────────────────
class Repo:
    """Files of the project, by path relative to its root. Every reader stops the build on a miss."""

    def __init__(self, root):
        self.root = os.path.abspath(root)
        self._lines = {}

    def path(self, rel):
        return os.path.join(self.root, rel)

    def exists(self, rel):
        return os.path.exists(self.path(rel))

    def lines_of(self, rel):
        if rel not in self._lines:
            if not self.exists(rel):
                die("no such file: " + rel)
            with open(self.path(rel), encoding="utf-8") as f:
                self._lines[rel] = f.read().split("\n")
        return self._lines[rel]

    def text(self, rel):
        return "\n".join(self.lines_of(rel))

    def line_of(self, rel, anchor):
        """1-based number of the first line containing `anchor`."""
        for i, line in enumerate(self.lines_of(rel), 1):
            if anchor in line:
                return i
        die(f"anchor not found in {rel}: {anchor!r}")

    def excerpt(self, rel, anchor, n, back=0):
        """`n` lines of `rel` starting `back` lines before the anchor line, dedented."""
        start = self.line_of(rel, anchor) - back
        body = self.lines_of(rel)[start - 1:start - 1 + n]
        indent = min((len(l) - len(l.lstrip()) for l in body if l.strip()), default=0)
        return {"file": rel, "from": start, "to": start + n - 1,
                "code": "\n".join(l[indent:] for l in body).rstrip()}

    def call(self, label, rel, anchor):
        """One frame of a step's walkthrough: a label, and the line the anchor is on."""
        return {"call": label, "file": rel, "line": self.line_of(rel, anchor)}

    def at(self, label, rel, anchor):
        """'Label (File.java:123)' — a location to quote in prose, read at build time."""
        return f"{label} ({os.path.basename(rel)}:{self.line_of(rel, anchor)})"

    def load_json(self, rel):
        with open(self.path(rel), encoding="utf-8") as f:
            return json.load(f)

    def latest(self, dir_rel, suffix=".json"):
        """The last file of a directory by name — for run records named by timestamp."""
        if not os.path.isdir(self.path(dir_rel)):
            die("no such directory: " + dir_rel)
        names = sorted(n for n in os.listdir(self.path(dir_rel)) if n.endswith(suffix))
        if not names:
            die("nothing in " + dir_rel)
        return dir_rel + "/" + names[-1]

    def size(self, rel):
        return os.path.getsize(self.path(rel))


def trim(v, n=110):
    """A value cut down for display: long strings end in an ellipsis, containers keep their shape."""
    if isinstance(v, str) and len(v) > n:
        return v[:n] + "…"
    if isinstance(v, list):
        return [trim(x, n) for x in v]
    if isinstance(v, dict):
        return {k: trim(x, n) for k, x in v.items()}
    return v


def short(text, n=58):
    return text if len(text) <= n else text[:n - 1] + "…"


def first_sentence(text):
    m = re.match(r"(.+?[.:])(?:\s|$)", text)
    return (m.group(1) if m else text).rstrip(":").rstrip(".")


# ── the pieces of a graph ────────────────────────────────────────────────────────────────────
def graph(clusters=()):
    return {"nodes": [], "edges": [], "clusters": [{"id": "c:" + c, "label": c} for c in clusters]}


def node(id_, kind, title, phrase, text=None, **more):
    """A box: a title, ONE phrase, and the in-depth explanation shown when it is selected.

    kind: step | frame | human | gap | class | slot | data | file | ext | alt
    more: step=<step id> (the box belongs to that step), cluster="c:<name>", and any of the
          detail parts — kv=[[k, v]], table={"head": [...], "rows": [[...]]},
          file={"name": ..., "text": ...}, json=<value>, code=[excerpt], methods=[...]."""
    detail = {"text": [text] if isinstance(text, str) else list(text or [])}
    out = {"id": id_, "kind": kind, "title": title, "rows": [phrase] if isinstance(phrase, str) else list(phrase)}
    for k, v in more.items():
        (detail if k in ("kv", "table", "file", "json", "code", "methods", "uses") else out)[k] = v
    out["detail"] = detail
    return out


def edge(a, b, label="", kind="flow"):
    """kind: flow (runs next / calls) | read | write | alt (other mode, conditional) | gap (not built) | seq."""
    return {"from": a, "to": b, "label": label, "kind": kind}


def step_node(step, number, cluster=True):
    kind = step.get("kind", "step")
    out = {"id": "s:" + step["id"], "kind": kind if kind in ("gap", "frame", "human") else "step",
           "title": f"{number} · {step['name']}", "step": step["id"], "rows": [step["phrase"]]}
    if cluster:
        out["cluster"] = "c:" + step["stage"]
    return out


def spine(g, step_ids):
    """The order of the run, drawn faintly, so a lens about data or files still reads as a flow."""
    for a, b in zip(step_ids, step_ids[1:]):
        g["edges"].append({"from": "s:" + a, "to": "s:" + b, "kind": "seq"})


def process_lens(steps, stages, labels=None, gap_from=None):
    """Control flow: one box per step, grouped by stage, an arrow to the next step.
    labels: {step id: text on the arrow LEAVING it}. Add loops and alternative paths afterwards."""
    g = graph(stages)
    labels = labels or {}
    for i, s in enumerate(steps):
        g["nodes"].append(step_node(s, i + 1))
    for a, b in zip(steps, steps[1:]):
        g["edges"].append(edge("s:" + a["id"], "s:" + b["id"], labels.get(a["id"], ""), "gap" if b.get("kind") == "gap" else "flow"))
    return g


def resource_lens(steps, things, kind, prefix):
    """A lens about things the steps leave for each other — state, files, records.

    things: [{"id", "title", "phrase", "text", "writes": [step ids], "reads": [step ids], ...detail parts}].
    Draws every step that touches a thing, an amber arrow where a step writes it and a dashed one
    where a step reads it, and the faint spine of the run. Steps that touch nothing are listed in
    the graph's `empty`, and the page says so when one is opened."""
    g = graph()
    by_id = {s["id"]: i for i, s in enumerate(steps)}
    touched = set()
    for t in things:
        more = {k: v for k, v in t.items() if k not in ("id", "title", "phrase", "text", "writes", "reads")}
        g["nodes"].append(node(prefix + ":" + t["id"], kind, t["title"], t["phrase"], t.get("text"), **more))
        for sid in t.get("writes", []):
            g["edges"].append(edge("s:" + sid, prefix + ":" + t["id"], "", "write"))
        for sid in t.get("reads", []):
            g["edges"].append(edge(prefix + ":" + t["id"], "s:" + sid, "", "read"))
        for sid in list(t.get("writes", [])) + list(t.get("reads", [])):
            if sid not in by_id:
                die(f"{kind} {t['id']!r} names a step that does not exist: {sid}")
            touched.add(sid)
    order = [s["id"] for s in steps if s["id"] in touched]
    g["nodes"] = [step_node(steps[by_id[sid]], by_id[sid] + 1, cluster=False) for sid in order] + g["nodes"]
    spine(g, order)
    g["empty"] = [s["id"] for s in steps if s["id"] not in touched]
    return g


def section(title, text=None, list=None, loc=None, note=None, code=None):
    """One titled part of a step's in-depth explanation. `list` is the ordered work done."""
    out = {"title": title}
    for k, v in (("text", text), ("list", list), ("loc", loc), ("note", note), ("code", code)):
        if v:
            out[k] = v
    return out


# ── the call graph, from compiled bytecode ───────────────────────────────────────────────────
class Bytecode:
    """Who calls whom, read with `javap -c -p`. Only classes whose name starts with `prefix`."""

    def __init__(self, classes_dirs, prefix):
        self.prefix = prefix
        self.kinds, self.supers = {}, {}
        self.calls = collections.defaultdict(set)      # (class, method) -> {(class, method)}
        self.methods = collections.defaultdict(set)
        self.impls = collections.defaultdict(set)      # interface or superclass -> concrete classes
        for d in ([classes_dirs] if isinstance(classes_dirs, str) else classes_dirs):
            self._read(d)
        for c, ms in self.methods.items():             # a lambda's body is a synthetic method of the same class
            for m in ms:
                mm = re.match(r"lambda\$(.+?)\$\d+$", m)
                if mm:
                    self.calls[(c, "<init>" if mm.group(1) == "new" else mm.group(1))].add((c, m))
        for c, k in self.kinds.items():
            if k != "interface":
                for sup in self._all_supers(c, set()):
                    self.impls[sup].add(c)

    def _all_supers(self, c, seen):
        for sup in self.supers.get(c, []):
            if sup not in seen:
                seen.add(sup)
                self._all_supers(sup, seen)
        return seen

    def _read(self, classes_dir):
        names = []
        for base, _, fs in os.walk(classes_dir):
            for f in fs:
                if f.endswith(".class"):
                    names.append(os.path.relpath(os.path.join(base, f), classes_dir)[:-6].replace(os.sep, "."))
        names = [n for n in names if n.startswith(self.prefix)]
        if not names:
            die(f"{classes_dir} holds no compiled class under {self.prefix!r}: compile the project first")
        text = ""
        for i in range(0, len(names), 300):
            try:
                text += subprocess.run(["javap", "-c", "-p", "-cp", classes_dir] + names[i:i + 300],
                                       capture_output=True, text=True, check=True).stdout
            except FileNotFoundError:
                die("no `javap` on PATH: a JDK is needed to read the call graph")
        self._parse(text)

    def _parse(self, text):
        cls = meth = None
        split = lambda t: [re.sub(r"<.*", "", x.strip()) for x in re.split(r",(?![^<]*>)", t) if x.strip()]
        for l in text.split("\n"):
            if l.startswith("Compiled from"):
                cls = None
                continue
            if not l.startswith(" ") and l.endswith("{"):
                m = re.match(r"^(.*?)(class|interface) ([\w.$]+)(?:<[^{]*?>)?(?: extends (.+?))?(?: implements (.+?))? \{$", l)
                if m:
                    cls, ext, imp = m.group(3), m.group(4) or "", m.group(5) or ""
                    self.supers[cls] = [x for x in split(ext) + split(imp) if x.startswith(self.prefix)]
                    self.kinds[cls] = ("interface" if m.group(2) == "interface" else "record" if "java.lang.Record" in ext
                                       else "enum" if "java.lang.Enum" in ext else "abstract" if "abstract" in m.group(1) else "class")
                    meth = None
                continue
            if cls is None:
                continue
            m = re.match(r"^  (?:[\w.$<>\[\], ?]+ )?([\w$<>]+)\((.*)\)(?: throws .*)?;$", l)
            if m:
                meth = "<init>" if m.group(1) in (cls, cls.split(".")[-1]) else m.group(1)
                self.methods[cls].add(meth)
                continue
            if l.strip() == "static {};":
                meth = "<clinit>"
                continue
            m = re.search(r"invoke(?:virtual|static|special|interface)\s+#\d+(?:,\s*\d+)?\s+// (?:Interface)?Method (?:([\w/$]+)\.)?(\"?<?[\w$]+>?\"?):", l)
            if m and meth:
                c = (m.group(1) or cls.replace(".", "/")).replace("/", ".")
                if c.startswith(self.prefix):
                    self.calls[(cls, meth)].add((c, m.group(2).strip('"')))

    def reach(self, entries, keep=None, dispatch=None):
        """Every (class, method) reachable from `entries` through classes `keep` accepts.

        A call on an interface or abstract class continues into its implementations — all the
        compiled ones, unless `dispatch` names the ones this run uses: {interface: [classes]}.
        An interface with a hundred implementations needs an entry there, or the step's graph
        becomes the whole program."""
        keep = keep or (lambda t: t in self.kinds)
        dispatch = dispatch or {}
        seen, queue = set(), list(entries)
        for c, m in entries:
            if top_of(c) not in self.kinds:
                die(f"entry class is not in the bytecode: {c}")
            if m not in self.methods.get(c, ()):
                die(f"entry method is not in the bytecode: {c}.{m}")
        while queue:
            c, m = queue.pop()
            if (c, m) in seen:
                continue
            seen.add((c, m))
            for c2, m2 in self.calls.get((c, m), ()):
                targets = [c2]
                if self.kinds.get(top_of(c2)) in ("interface", "abstract"):
                    targets += dispatch.get(c2, sorted(self.impls.get(c2, ())))
                for t in targets:
                    if keep(top_of(t)):
                        queue.append((t, m2))
        return seen


def top_of(cls):
    """The top-level class a nested or anonymous class belongs to."""
    return cls.split("$")[0]


class Loaded:
    """The project classes the JVM loaded in one measured run (scripts/classload.py writes the file)."""

    def __init__(self, measurement):
        self.record = measurement
        self.all = {top_of(c["class"]) for c in measurement["classes"]}
        self.boot = {top_of(c["class"]) for c in measurement["classes"] if c.get("phase") == "boot"}

    def __contains__(self, cls):
        return cls in self.all


# ── the Code lens ────────────────────────────────────────────────────────────────────────────
class CodeLens:
    """Turns reachable methods into the boxes and arrows of one step's Code view."""

    def __init__(self, repo, bytecode, source_roots, excerpts=()):
        """source_roots: where the .java files are, relative to the repo root, e.g. ["src/main/java"].
        excerpts: every excerpt the steps quote, so a class box can show the ones cut from its file."""
        self.repo, self.bc, self.prefix = repo, bytecode, bytecode.prefix
        self.roots = [source_roots] if isinstance(source_roots, str) else list(source_roots)
        self.by_file = collections.defaultdict(list)
        for e in excerpts:
            self.by_file[e["file"]].append(e)

    def file_of(self, fq):
        for root in self.roots:
            rel = root.rstrip("/") + "/" + top_of(fq).replace(".", "/") + ".java"
            if self.repo.exists(rel):
                return rel
        return None

    def fq_of(self, file_rel):
        for root in self.roots:
            base = root.rstrip("/") + "/"
            if file_rel.startswith(base):
                return file_rel[len(base):-5].replace("/", ".")
        die(f"{file_rel} is under none of the source roots {self.roots}")

    def javadoc_of(self, fq):
        """First paragraph of the class's own Javadoc, as plain text: what the SOURCE says it is."""
        f = self.file_of(fq)
        if not f:
            return ""
        name = fq.rsplit(".", 1)[-1]
        m = re.search(r"/\*\*((?:(?!\*/).)*?)\*/\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public |final |abstract |sealed |non-sealed |static )*"
                      r"(?:class|interface|record|enum) " + re.escape(name) + r"\b", self.repo.text(f), re.S)
        if not m:
            return ""
        text = "\n".join(l.strip().lstrip("*").strip() for l in m.group(1).split("\n"))
        text = re.split(r"\n\s*\n|<p>|<pre>|<h\d>|\n@", text.strip())[0]
        text = re.sub(r"\{@(?:code|link|linkplain)\s+([^}]*)\}", r"\1", text)
        text = re.sub(r"<[^>]+>", "", text).replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        return re.sub(r"\s+", " ", text).strip()

    def _pkg(self, fq):
        rest = fq[len(self.prefix):]
        return rest.rsplit(".", 1)[0] if "." in rest else "(root)"

    def class_graph(self, seen, entry_classes=(), keep=None, extra_nodes=(), extra_edges=(), force=()):
        """seen: the (class, method) pairs from Bytecode.reach. Records and enums are left out as
        boxes (they are data, not actors) unless named in `force`. An interface with a drawn
        implementation is not a second box: its callers point at the implementation."""
        bc = self.bc
        keep = keep or (lambda t: t in bc.kinds)
        members = collections.defaultdict(set)
        for c, m in seen:
            t = top_of(c)
            if (bc.kinds.get(t) in ("record", "enum") and t not in force) or not keep(t):
                continue
            members[t].add(m)
        for t in list(members):
            if bc.kinds.get(t) == "interface" and any(i in members for i in bc.impls.get(t, ())):
                del members[t]
        resolve = lambda c: [c] if c in members else [i for i in bc.impls.get(c, ()) if i in members]
        edges = set()
        for c, m in seen:
            a = top_of(c)
            if a not in members:
                continue
            for c2, _ in bc.calls.get((c, m), ()):
                for b in resolve(top_of(c2)):
                    if b != a:
                        edges.add((a, b))
        nodes, pkgs = [], {}
        for t in sorted(members):
            pkg = self._pkg(t)
            pkgs[pkg] = "c:" + pkg
            ms = sorted(m for m in members[t] if not m.startswith(("lambda$", "access$")) and m != "<clinit>")
            name = t.rsplit(".", 1)[-1]
            f, doc = self.file_of(t), self.javadoc_of(t)
            nodes.append({"id": "k:" + t, "kind": "class", "title": name, "sub": pkg, "cluster": "c:" + pkg,
                          "entry": t in entry_classes,
                          "rows": [short(first_sentence(doc)) if doc else f"{bc.kinds.get(t, 'class')} in {pkg}"],
                          "detail": {"text": [doc] if doc else ["The source carries no description for this class."],
                                     "kv": [["package", (self.prefix + pkg) if pkg != "(root)" else self.prefix.rstrip(".")],
                                            ["kind", bc.kinds.get(t, "class")]] + ([["file", f]] if f else []),
                                     "methods": [("new " + name + "(…)") if m == "<init>" else m + "(…)" for m in ms],
                                     "code": self.by_file.get(f, [])}})
        nodes += list(extra_nodes)
        for n in extra_nodes:
            if n.get("cluster"):
                pkgs[n["cluster"][2:]] = n["cluster"]
        ids = {n["id"] for n in nodes}
        all_edges = [{"from": "k:" + a, "to": "k:" + b, "kind": "flow"} for a, b in sorted(edges)]
        all_edges += [e for e in extra_edges if e["from"] in ids and e["to"] in ids]
        return {"nodes": nodes, "clusters": [{"id": cid, "label": pkg} for pkg, cid in sorted(pkgs.items())], "edges": all_edges}

    def step_graph(self, entries, key_classes, note, keep=None, dispatch=None, entry_classes=None,
                   declared=(), **more):
        """One step's Code view: everything its entry methods reach, and the small `key` view.

        key_classes: the classes the step's walkthrough names, in order. The arrows between them
        are the REAL calls among them — never the order they were listed in.
        declared: [(from class, to class, label)] for a call the bytecode cannot show (through an
        interface the graph does not expand, by reflection, by a framework). It is drawn only
        with its label, which must say why it is there."""
        g = self.class_graph(self.bc.reach(entries, keep, dispatch), entry_classes or {c for c, _ in entries}, keep, **more)
        g["note"] = note
        g["key"] = self.key_view(g, ["k:" + c for c in key_classes], declared)
        return g

    @staticmethod
    def key_view(g, key_ids, declared=()):
        have = {n["id"] for n in g["nodes"]}
        key_ids = list(dict.fromkeys(k for k in key_ids if k in have))
        edges = [dict(e) for e in g["edges"] if e["from"] in key_ids and e["to"] in key_ids]
        for a, b, label in declared:
            a, b = (a if ":" in a else "k:" + a), (b if ":" in b else "k:" + b)
            if not label:
                die(f"a declared edge needs a label saying why it is drawn: {a} -> {b}")
            if a in key_ids and b in key_ids:
                edges = [e for e in edges if not (e["from"] == a and e["to"] == b)]
                edges.append({"from": a, "to": b, "label": label, "kind": "flow", "declared": True})
        return {"nodes": key_ids, "edges": edges}

    @staticmethod
    def overview(code_steps, number_of):
        """The whole run: one box per package, the classes the run uses in it, and which package
        calls which. number_of: {step id: its number on the page}."""
        uses = collections.defaultdict(lambda: collections.defaultdict(list))
        pkg_edges = collections.Counter()
        for sid, g in code_steps.items():
            where = {n["id"]: n.get("sub") for n in g["nodes"] if n["id"].startswith("k:")}
            for n in g["nodes"]:
                if n["id"].startswith("k:"):
                    uses[n["sub"]][n["title"]].append(number_of[sid])
            for e in g["edges"]:
                a, b = where.get(e["from"]), where.get(e["to"])
                if a and b and a != b:
                    pkg_edges[(a, b)] += 1
        out = graph()
        for pkg, cl in sorted(uses.items()):
            names = sorted(cl)
            out["nodes"].append({"id": "g:" + pkg, "kind": "class", "title": pkg,
                                 "rows": [f"{len(names)} class{'es' if len(names) != 1 else ''} used by the run"],
                                 "detail": {"text": [f"The classes of {pkg} that the run's code reaches, and the steps that reach each. "
                                                     "Open a step to see them drawn, with their calls."],
                                            "uses": [[name, ", ".join(str(i) for i in sorted(set(cl[name])))] for name in names]}})
        out["edges"] = [{"from": "g:" + a, "to": "g:" + b, "label": str(n), "kind": "flow"} for (a, b), n in sorted(pkg_edges.items())]
        return out


# ── checking and writing ─────────────────────────────────────────────────────────────────────
NODE_KINDS = {"step", "frame", "human", "gap", "class", "slot", "data", "file", "ext", "alt"}
EDGE_KINDS = {"flow", "read", "write", "alt", "gap", "seq"}


def validate(data):
    """Everything wrong with a trace-data value, as a list of sentences. Empty means it may be written."""
    bad = []
    for k in ("title", "lenses", "steps", "graphs"):
        if not data.get(k):
            bad.append(f"missing top-level '{k}'")
    if bad:
        return bad
    lens_ids = [l.get("id") for l in data["lenses"]]
    for l in data["lenses"]:
        for k in ("id", "label", "whole", "step"):
            if not l.get(k):
                bad.append(f"lens {l.get('id')!r}: missing '{k}' (whole = the claim over the whole run, step = over one step)")
    if set(lens_ids) != set(data["graphs"]):
        bad.append(f"lenses {sorted(lens_ids)} and graphs {sorted(data['graphs'])} must name the same layers")
    step_ids = [s.get("id") for s in data["steps"]]
    if len(set(step_ids)) != len(step_ids):
        bad.append("two steps share an id")
    for s in data["steps"]:
        sid = s.get("id")
        for k in ("id", "name", "title", "stage", "what"):
            if not s.get(k):
                bad.append(f"step {sid!r}: missing '{k}'")
        if not (s.get("detail") or {}).get("sections"):
            bad.append(f"step {sid!r}: no detail.sections — the in-depth explanation is the point of opening a step")
        if s.get("kind") == "gap" and not s.get("banner"):
            bad.append(f"step {sid!r}: a step that is not built needs a 'banner' saying so")

    def check(name, g, known_steps=True):
        ids = [n.get("id") for n in g.get("nodes", [])]
        if len(set(ids)) != len(ids):
            bad.append(f"{name}: two nodes share an id")
        ids, clusters = set(ids), {c["id"] for c in g.get("clusters", [])}
        for n in g.get("nodes", []):
            where = f"{name}: node {n.get('id')!r}"
            if n.get("kind") not in NODE_KINDS:
                bad.append(f"{where}: unknown kind {n.get('kind')!r}")
            rows = n.get("rows") or []
            if not n.get("title") or not rows:
                bad.append(f"{where}: needs a title and one phrase")
                continue
            phrase = rows[0] if isinstance(rows[0], str) else rows[0].get("t", "")
            if len(phrase) > PHRASE_MAX:
                bad.append(f"{where}: its phrase is {len(phrase)} characters; keep one phrase (≤ {PHRASE_MAX}) and move the rest to the detail")
            if len(rows) > 1 and n.get("kind") in ("step", "frame", "human", "gap", "class"):
                bad.append(f"{where}: {len(rows)} rows; a step or class box carries one phrase")
            if n.get("cluster") and n["cluster"] not in clusters:
                bad.append(f"{where}: cluster {n['cluster']!r} is not declared")
            if known_steps and n.get("step") and n["step"] not in step_ids:
                bad.append(f"{where}: belongs to step {n['step']!r}, which does not exist")
        for e in g.get("edges", []):
            if e.get("from") not in ids or e.get("to") not in ids:
                bad.append(f"{name}: arrow to a box that does not exist: {e.get('from')} -> {e.get('to')}")
            if e.get("kind", "flow") not in EDGE_KINDS:
                bad.append(f"{name}: arrow of unknown kind {e.get('kind')!r}")
        return ids

    for lens, g in data["graphs"].items():
        ids = check(f"graph '{lens}'", g)
        if lens != "code":
            drawn = {n.get("step") for n in g.get("nodes", [])}
            missing = [s for s in step_ids if s not in drawn and s not in g.get("empty", [])]
            if missing:
                bad.append(f"graph '{lens}': no box for steps {missing}. Draw them, or list them in the graph's 'empty' "
                           "so the page says there is nothing to draw rather than looking unfinished")
    for sid, g in (data.get("codeSteps") or {}).items():
        name = f"code of step '{sid}'"
        if sid not in step_ids:
            bad.append(f"{name}: no such step")
        ids = check(name, g, known_steps=False)
        real = {(e["from"], e["to"]) for e in g.get("edges", [])}
        key = g.get("key") or {"nodes": [], "edges": []}
        for k in key["nodes"]:
            if k not in ids:
                bad.append(f"{name}: key class {k} is not among the step's classes")
        for e in key["edges"]:
            if e["from"] not in key["nodes"] or e["to"] not in key["nodes"]:
                bad.append(f"{name}: key arrow leaves the key classes: {e['from']} -> {e['to']}")
            elif (e["from"], e["to"]) not in real and not (e.get("declared") and e.get("label")):
                bad.append(f"{name}: key arrow {e['from']} -> {e['to']} is not a call in the bytecode. "
                           "Remove it, or declare it with a label that says why it is drawn")
    return bad


def write_page(data, out_json, out_html=None, page=None, tab_title=None):
    """Validate, write the data, and (with out_html) the self-contained page. Stops on any problem."""
    for i, s in enumerate(data.get("steps", [])):
        s["n"] = i
    problems = validate(data)
    if problems:
        die(f"{len(problems)} problem(s), nothing written:\n  - " + "\n  - ".join(problems))
    os.makedirs(os.path.dirname(os.path.abspath(out_json)), exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"{out_json}: {len(data['steps'])} steps, {len(data['lenses'])} layers, "
          f"{sum(len(g['nodes']) for g in data['graphs'].values())} boxes")
    if not out_html:
        return
    page = page or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "page.html")
    with open(page, encoding="utf-8") as f:
        html = f.read()
    if html.count(MARKER) != 1:
        die(f"{page} must contain the marker exactly once: {MARKER}")
    if tab_title:
        if html.count("<title>Run Trace</title>") != 1:
            die(f"{page} has no <title>Run Trace</title> to rename")
        html = html.replace("<title>Run Trace</title>", "<title>" + tab_title.replace("<", "&lt;") + "</title>")
    os.makedirs(os.path.dirname(os.path.abspath(out_html)), exist_ok=True)
    with open(out_html, "w", encoding="utf-8") as f:
        f.write(html.replace(MARKER, json.dumps(data, ensure_ascii=False).replace("</", "<\\/")))
    print(f"{out_html}: written ({os.path.getsize(out_html) // 1024} KB)")


# ── self-test ────────────────────────────────────────────────────────────────────────────────
def _selftest():
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "A.java"), "w") as f:
            f.write("class A {\n    void run() {\n        go();\n    }\n}\n")
        r = Repo(d)
        e = r.excerpt("A.java", "void run", 3)
        assert (e["from"], e["to"], e["code"].split("\n")[0]) == (2, 4, "void run() {"), e
        try:
            r.line_of("A.java", "nothing here")
            raise AssertionError("a missing anchor must stop the build")
        except SystemExit:
            pass
    bc = Bytecode.__new__(Bytecode)
    bc.prefix, bc.kinds, bc.supers = "p.", {}, {}
    bc.calls, bc.methods, bc.impls = collections.defaultdict(set), collections.defaultdict(set), collections.defaultdict(set)
    bc._parse('Compiled from "A.java"\npublic class p.A implements p.I {\n  public p.A();\n    Code:\n'
              '       1: invokespecial #1                  // Method java/lang/Object."<init>":()V\n'
              '  public void run();\n    Code:\n       1: invokestatic  #7                  // Method p/B.go:()V\n}\n'
              'Compiled from "B.java"\nfinal class p.B {\n  static void go();\n    Code:\n       0: return\n}\n'
              'Compiled from "I.java"\ninterface p.I {\n  public abstract void run();\n}\n')
    assert bc.kinds == {"p.A": "class", "p.B": "class", "p.I": "interface"}, bc.kinds
    assert bc.calls[("p.A", "run")] == {("p.B", "go")}, dict(bc.calls)
    assert bc.reach([("p.A", "run")]) == {("p.A", "run"), ("p.B", "go")}
    step = {"id": "a", "name": "a", "title": "A", "stage": "S", "what": "w", "phrase": "does a",
            "detail": {"sections": [section("Work", list=["one"])]}}
    g = graph(["S"])
    g["nodes"].append(step_node(step, 1))
    data = {"title": "T", "lenses": [{"id": "process", "label": "Process", "whole": "x", "step": "y"}],
            "steps": [step], "graphs": {"process": g}}
    assert validate(data) == [], validate(data)
    g["edges"].append(edge("s:a", "s:ghost"))
    assert any("does not exist" in p for p in validate(data))
    g["edges"].clear()
    data["codeSteps"] = {"a": {"nodes": [node("k:p.A", "class", "A", "x"), node("k:p.B", "class", "B", "y")], "edges": [], "clusters": [],
                               "key": {"nodes": ["k:p.A", "k:p.B"], "edges": [edge("k:p.A", "k:p.B")]}}}
    assert any("not a call in the bytecode" in p for p in validate(data)), validate(data)
    print("tracekit selftest: ok")


if __name__ == "__main__":
    if sys.argv[1:2] == ["selftest"]:
        _selftest()
    elif sys.argv[1:2] == ["validate"] and len(sys.argv) == 3:
        with open(sys.argv[2], encoding="utf-8") as f:
            found = validate(json.load(f))
        print("\n".join("- " + p for p in found) if found else "ok")
        sys.exit(1 if found else 0)
    else:
        sys.exit(__doc__)
