#!/usr/bin/env python3
"""Render a data-and-execution-flow diagram from a spec (references/spec-format.md).

    python3 flowdiagram.py spec.json out.html          # validate, lay out, write one HTML page
    python3 flowdiagram.py spec.json out.html --svg out.svg
    python3 flowdiagram.py --check spec.json           # validate only

The agent writes the spec; this script owns every coordinate. It refuses to build when the
spec would draw something misleading: a loop with no way back, a decision with one branch, an
exit or return that points at nothing, or a label that does not fit its box. Standard library
only; the page is self-contained (fonts from Google Fonts, with fallbacks).
"""
import html
import json
import sys

E = html.escape

# ── geometry: one grid for every diagram ──────────────────────────────────────────────────
W = 1270
FLOW_CX = 290          # centre of the flow column
NODE_HALF = 190        # node box is FLOW_CX ± NODE_HALF
LOOP_STEP = 34         # each loop nesting level widens its frame by this much
GAP = 22               # vertical gap between blocks
DX0, DX1 = 620, 1255   # data column
RAIL_RIGHT = 562       # where refusals run back up
RAIL_LEFT = 24         # where early answers run back up
# px per character, per text class (JetBrains Mono is 0.6 em wide; Public Sans averages ~0.52 em)
TITLE, SUB, CELL, NAME, DEC = 13.5 * 0.6, 11 * 0.52, 11 * 0.6, 12 * 0.6, 12 * 0.52


class SpecError(Exception):
    pass


def text_w(s, per_char):
    return len(s) * per_char


class Canvas:
    def __init__(self):
        self.out = []

    def t(self, x, y, s, cls, anchor="start"):
        self.out.append(f'<text x="{x:.1f}" y="{y:.1f}" class="{cls}" text-anchor="{anchor}">{E(s)}</text>')

    def poly(self, pts, cls="flow", arrow=True):
        d = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        m = ' marker-end="url(#ah)"' if arrow else ""
        self.out.append(f'<polyline points="{d}" class="{cls}"{m}/>')

    def rect(self, x, y, w, h, cls, rx=6):
        self.out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" class="{cls}"/>')


class Layout:
    """Places the flow top-down. Every placed node records its box, so edges can find it."""

    def __init__(self, spec):
        self.spec = spec
        self.c = Canvas()
        self.boxes = {}            # node id -> (x0, y0, x1, y1)
        self.refusals = []         # (from_box, to_id, label): dashed, up the right rail
        self.returns = []          # (from_box, to_id, label): dashed, up the left rail
        self.links = []            # (node_box, table_id, label, top of its outermost loop)
        self.depth = max_depth(spec["flow"])
        self.x0 = FLOW_CX - NODE_HALF
        self.x1 = FLOW_CX + NODE_HALF

    # ── blocks ───────────────────────────────────────────────────────────────────────────
    def node(self, y, b, outer_top):
        style = b.get("style", "proc")
        sub = b.get("sub") or []
        sub = sub if isinstance(sub, list) else [sub]
        h = 30 + 14 * len(sub)
        x0, x1 = (self.x0 + 50, self.x1 - 50) if style == "ext" else (self.x0, self.x1)
        need = max([text_w(b["node"], TITLE)] + [text_w(s, SUB) for s in sub])
        if need > (x1 - x0) - 12:
            raise SpecError(f"o texto de «{b['node']}» não cabe na caixa ({need:.0f}px de {x1 - x0 - 12}px): "
                            "encurte o título e ponha o detalhe em sub")
        cls = {"proc": "proc", "key": "proc acc", "ext": "ext"}[style]
        self.c.rect(x0, y, x1 - x0, h, cls)
        self.c.t(FLOW_CX, y + 19, b["node"], "pname", "middle")
        for i, s in enumerate(sub):
            self.c.t(FLOW_CX, y + 34 + 14 * i, s, "pcls", "middle")
        box = (x0, y, x1, y + h)
        if b.get("id"):
            if b["id"] in self.boxes:
                raise SpecError(f"o id «{b['id']}» está em dois nós")
            self.boxes[b["id"]] = box
        if b.get("refuse"):
            self.refusals.append((box, b["refuse"]["to"], b["refuse"].get("label")))
        if b.get("returns"):
            self.returns.append((box, b["returns"]["to"], b["returns"].get("label")))
        if b.get("data"):
            self.links.append((box, b["data"], b.get("data_label"), outer_top if outer_top is not None else y))
        return box

    def decision(self, y, b, loop):
        sub = b.get("sub", "")
        h = 56 if sub else 50
        w = max(240, min(320, int(max(text_w(b["decision"], DEC), text_w(sub, SUB)) + 130)))
        if max(text_w(b["decision"], DEC), text_w(sub, SUB)) > w * 0.66:
            raise SpecError(f"o texto da decisão «{b['decision']}» não cabe no losango: encurte-o")
        cx, cy = FLOW_CX, y + h / 2
        self.c.out.append(f'<polygon points="{cx},{y} {cx + w / 2},{cy} {cx},{y + h} {cx - w / 2},{cy}" class="dec"/>')
        self.c.t(cx, cy + (-2 if sub else 4), b["decision"], "dname", "middle")
        if sub:
            self.c.t(cx, cy + 12, sub, "pcls", "middle")
        box = (cx - w / 2, y, cx + w / 2, y + h)
        br, back = b.get("branch"), b.get("back")
        if not br and not back and not b.get("either"):
            raise SpecError(f"a decisão «{b['decision']}» só tem um caminho: diga para onde vai o outro "
                            "(branch, back, ou either quando os dois caminhos seguem para o mesmo bloco)")
        if (br and br["to"] in ("exit", "next") or back) and loop is None:
            raise SpecError(f"a decisão «{b['decision']}» sai ou volta a um laço, mas não está dentro de nenhum")
        if br:
            label = br.get("label")
            if br["to"] == "exit":
                loop["exits"].append((box[2], cy, label))
            elif br["to"] == "next":
                loop["nexts"].append((box[2], cy, label))
            else:
                self.refusals.append((box, br["to"], label))
        if back:
            loop["backs"].append((box[0], cy, back if isinstance(back, list) else [back]))
        return box

    def thread(self, y, b):
        th = b["thread"]
        yl = y + 4
        self.c.out.append(f'<line x1="20" y1="{yl}" x2="{RAIL_RIGHT + 8}" y2="{yl}" class="thread"/>')
        self.c.t(RAIL_RIGHT + 12, yl - 6, th["above"], "esub")
        self.c.t(RAIL_RIGHT + 12, yl + 14, th["below"], "esub")
        return (self.x0, y, self.x1, y + 8)

    def loop(self, y, b, outer, outer_top):
        lp = b["loop"]
        d = outer["depth"] + 1 if outer else 1
        grow = (self.depth - d + 1) * LOOP_STEP
        fx0, fx1 = self.x0 - grow, self.x1 + grow
        rec = {"depth": d, "exits": [], "nexts": [], "backs": []}
        y_end, first, (last_b, last_box) = self.place(y + 40, lp["body"], rec, outer_top if outer_top is not None else y)
        bottom = y_end + (46 if rec["backs"] else 26)
        lane = fx0 + 14
        fy = (first[1] + first[3]) / 2
        # the way back to the top: from the decisions that say so, or from the last block
        for (x, yy, lines) in rec["backs"]:
            self.c.poly([(x, yy), (lane, yy), (lane, fy), (first[0], fy)])
            for k, s in enumerate(lines):
                self.c.t(lane + 8, yy + 15 + 13 * k, s, "flab")
        if not ("decision" in last_b and last_b.get("back")):
            if not lp.get("back_label"):
                raise SpecError(f"o laço «{lp['title']}» não diz o que o faz voltar ao início (back_label)")
            if last_box is first:
                # a loop of one block: out at its lower left, back in at its upper left
                lo, hi = last_box[3] - 8, last_box[1] + 8
                self.c.poly([(last_box[0], lo), (lane, lo), (lane, hi), (last_box[0], hi)])
                self.c.t(lane - 4, last_box[3] + 14, lp["back_label"], "flab")
            else:
                ly = (last_box[1] + last_box[3]) / 2
                self.c.poly([(last_box[0], ly), (lane - 6, ly), (lane - 6, fy), (first[0], fy)])
                self.c.t(lane + 2, ly + 16, lp["back_label"], "flab")
        # skip to the next turn: up the right side, into the top of the first block
        for (x, yy, label) in rec["nexts"]:
            rx = fx1 - 10
            self.c.poly([(x, yy), (rx, yy), (rx, first[1] - 10), (FLOW_CX + 20, first[1] - 10), (FLOW_CX + 20, first[1])])
            if label:
                self.c.t(x + 6, yy - 6, label, "flab")
        # leave the loop: along to the exit rail; the rail lands on the block after the frame
        rail = fx1 - 18
        for (x, yy, label) in rec["exits"]:
            self.c.poly([(x, yy), (rail, yy)], arrow=False)
            for k, s in enumerate(label if isinstance(label, list) else ([label] if label else [])):
                self.c.t(rail - 6, yy + 15 + 13 * k, s, "flab", "end")
        self.c.rect(fx0, y, fx1 - fx0, bottom - y, "loop", rx=10)
        self.c.t(fx0 + 12, y + 16, lp["title"], "ftitle")
        if lp.get("sub"):
            self.c.t(fx0 + 12, y + 30, lp["sub"], "esub")
        self.c.poly([(FLOW_CX, y_end), (FLOW_CX, bottom)], arrow=False)
        exits = {"rail": rail, "from_y": min(e[1] for e in rec["exits"]), "label": lp.get("exit_label")} if rec["exits"] else None
        return (fx0, y, fx1, bottom), exits

    # ── a sequence of blocks; `loop` is the innermost enclosing loop, None at the top ─────
    def place(self, y, blocks, loop, outer_top):
        first = last = pending = None
        for i, b in enumerate(blocks):
            if i:
                y2 = y + GAP + (8 if b.get("in") else 0)
                self.c.poly([(FLOW_CX, y), (FLOW_CX, y2)])
                if b.get("in"):
                    self.c.t(FLOW_CX + 8, (y + y2) / 2 + 4, b["in"], "flab")
                y = y2
            exits = None
            if "node" in b:
                box = self.node(y, b, outer_top)
            elif "decision" in b:
                box = self.decision(y, b, loop)
            elif "thread" in b:
                box = self.thread(y, b)
            elif "loop" in b:
                box, exits = self.loop(y, b, loop, outer_top)
            else:
                raise SpecError(f"bloco desconhecido: {sorted(b)}")
            if pending:
                if "node" not in b:
                    raise SpecError("depois de um laço com saídas tem de vir um nó: é onde as saídas chegam")
                self.c.poly([(pending["rail"], pending["from_y"]), (pending["rail"], box[1] + 18), (box[2], box[1] + 18)])
                if pending.get("label"):
                    self.c.t(box[2] - 4, box[1] - 4, pending["label"], "flab", "end")
            pending = exits
            first = first or box
            last = (b, box)
            y = box[3]
        if pending:
            raise SpecError("um laço com saídas não pode ser o último bloco da sua sequência")
        return y, first, last


def max_depth(blocks, d=0):
    m = d
    for b in blocks:
        if "loop" in b:
            m = max(m, max_depth(b["loop"]["body"], d + 1))
    return m


def render(spec):
    validate(spec)
    lay = Layout(spec)
    y_flow, _, _ = lay.place(30, spec["flow"], None, None)
    c = lay.c
    for kind, rail, items in (("recusa", RAIL_RIGHT, lay.refusals), ("resposta", RAIL_LEFT + 16, lay.returns)):
        labelled = set()
        for (box, to, label) in items:
            if to not in lay.boxes:
                raise SpecError(f"uma {kind} aponta para «{to}», que nenhum nó tem como id")
            tb = lay.boxes[to]
            yy = (box[1] + box[3]) / 2
            if rail == RAIL_RIGHT:
                c.poly([(box[2], yy), (rail, yy), (rail, tb[1] + 22), (tb[2], tb[1] + 22)], cls="flow dash")
            else:
                c.poly([(box[0], yy), (rail, yy), (rail, tb[1] + 22), (tb[0], tb[1] + 22)], cls="flow dash")
            if label and (to, label) not in labelled:
                labelled.add((to, label))
                c.t(rail + 6, tb[3] + 30 + 14 * len(labelled), label, "flab")
    tables = spec.get("tables", {})
    y_tables = None
    placed = set()
    for (box, tid, label, anchor) in lay.links:
        if tid not in tables:
            raise SpecError(f"um nó liga à tabela «{tid}», que não existe em tables")
        if tid in placed:
            raise SpecError(f"a tabela «{tid}» tem dois nós a ligar-lhe: uma tabela, um nó")
        placed.add(tid)
        top = anchor if y_tables is None else max(anchor, y_tables + 24)
        bottom = draw_table(c, top, tables[tid])
        y_tables = bottom
        ny = (box[1] + box[3]) / 2
        if top + 30 <= ny <= bottom - 10:
            c.poly([(box[2], ny), (DX0, ny)])
        else:
            c.poly([(box[2], ny), (RAIL_RIGHT - 2, ny), (RAIL_RIGHT - 2, top + 30), (DX0, top + 30)])
        if label:
            c.t(box[2] + 48, ny - 6, label, "flab")
    unused = set(tables) - placed
    if unused:
        raise SpecError(f"tabelas que nenhum nó liga: {sorted(unused)}")
    h = max(y_flow, y_tables or 0) + 24
    hdr = (f'<text x="{FLOW_CX}" y="16" class="col" text-anchor="middle">{E(spec.get("flow_header", "FLUXO DE EXECUÇÃO"))}</text>'
           f'<text x="{(DX0 + DX1) / 2}" y="16" class="col" text-anchor="middle">{E(spec.get("data_header", "DADOS DE CADA PASSO"))}</text>')
    return (f'<svg viewBox="0 0 {W} {h:.0f}" role="img" aria-label="{E(spec["aria"])}">'
            '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            '<path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>' + hdr + "".join(c.out) + "</svg>")


def draw_table(c, y0, tb):
    cols = tb["columns"]
    C1, C2, C3 = DX0 + 12, DX0 + 182, DX0 + 405
    widths = (C2 - C1 - 8, C3 - C2 - 8, DX1 - C3 - 8)
    hh = 58

    def lines(row):
        return max(2, len(row["reads"]), len(row["writes"]) + len(row.get("io", [])))
    for r in tb["rows"]:
        for s, w, per in [(r["name"], widths[0], NAME)] + [(x, widths[1], CELL) for x in r["reads"]] + \
                         [(x, widths[2], CELL) for x in r["writes"] + r.get("io", [])]:
            if text_w(s, per) > w:
                raise SpecError(f"na tabela «{tb['title']}», «{s}» não cabe na coluna ({text_w(s, per):.0f}px de {w}px): parta-o em duas linhas")
    heights = [lines(r) * 13 + 20 for r in tb["rows"]]
    total = hh + sum(heights) + 12
    c.rect(DX0, y0, DX1 - DX0, total, "dframe", rx=8)
    c.t(DX0 + 12, y0 + 17, tb["title"], "ftitle")
    if tb.get("sub"):
        c.t(DX0 + 12, y0 + 31, tb["sub"], "esub")
    yh = y0 + hh
    for x, name in zip((C1, C2, C3), cols):
        c.t(x, yh - 4, name, "colh")
    ry = yh + 4
    for i, r in enumerate(tb["rows"]):
        if i:
            c.out.append(f'<line x1="{DX0 + 8}" y1="{ry:.1f}" x2="{DX1 - 8}" y2="{ry:.1f}" class="sep"/>')
        c.t(C1, ry + 16, r["name"], "sname2")
        if r.get("tag"):
            c.t(C1, ry + 30, r["tag"], "esub")
        for k, s in enumerate(r["reads"]):
            c.t(C2, ry + 16 + 13 * k, s, "slot")
        for k, s in enumerate(r["writes"]):
            c.t(C3, ry + 16 + 13 * k, s, "slot")
        for k, s in enumerate(r.get("io", [])):
            c.t(C3, ry + 16 + 13 * (len(r["writes"]) + k), s, "io")
        ry += heights[i]
    return y0 + total


def validate(spec):
    for key in ("title", "aria", "flow"):
        if key not in spec:
            raise SpecError(f"falta «{key}» no spec")
    loops = []

    def walk(blocks):
        for b in blocks:
            if "loop" in b:
                loops.append(b["loop"])
                if not b["loop"].get("body"):
                    raise SpecError(f"o laço «{b['loop']['title']}» não tem corpo")
                walk(b["loop"]["body"])
    walk(spec["flow"])
    if not loops:
        raise SpecError("um fluxo de execução sem laços não precisa deste diagrama: use um fluxograma simples ou escreva uma frase")


PAGE_CSS = """
:root {
  --bg: #f6f7f5; --surface: #ffffff; --fg: #1d2421; --muted: #5d6864; --rule: #d6dcd9;
  --accent: #1f5f8b; --accent-soft: #e3eef6; --store: #6b5a2e; --loop: #9a3d1f;
  --body: "Public Sans", "Segoe UI", system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #131816; --surface: #1a201e; --fg: #e2e7e4; --muted: #9aa5a0; --rule: #2f3835;
  --accent: #7db7df; --accent-soft: #1d2f3c; --store: #d4bd85; --loop: #f0a07c; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #131816; --surface: #1a201e; --fg: #e2e7e4; --muted: #9aa5a0; --rule: #2f3835;
  --accent: #7db7df; --accent-soft: #1d2f3c; --store: #d4bd85; --loop: #f0a07c; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.55 var(--body); }
.wrap { max-width: 1280px; margin: 0 auto; padding-block: 28px 56px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  display: grid; gap: 24px; }
.wrap > * { min-width: 0; }
.eyebrow { font: 500 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
h1 { font: 700 clamp(26px, 3.6vw, 36px)/1.15 var(--body); margin: 8px 0 6px; text-wrap: balance; }
h2 { font: 700 20px/1.3 var(--body); margin: 8px 0 0; }
p { margin: 0; max-width: 72ch; color: var(--muted); }
figure { margin: 0; background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; overflow-x: auto; }
figure svg { display: block; width: 100%; min-width: 1040px; height: auto; color: var(--fg); padding: 12px; box-sizing: border-box; }
figcaption { display: grid; gap: 8px; padding: 12px 16px 14px; color: var(--muted); font-size: 13.5px; border-top: 1px solid var(--rule); }
figcaption p { max-width: 100ch; } figcaption ul { margin: 0; padding-left: 20px; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 13px; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 8px; }
.k { display: inline-block; width: 26px; height: 14px; }
.k.e { border: 2px solid var(--fg); } .k.p { border: 1.5px solid var(--accent); background: var(--accent-soft); border-radius: 3px; }
.k.l { border: 2px solid var(--loop); border-radius: 5px; }
.k.d { width: 14px; height: 14px; border: 1.5px solid var(--fg); transform: rotate(45deg); margin: 0 6px; }
.k.b { border-top: 2px dashed var(--fg); height: 0; }
.proc { fill: var(--surface); stroke: var(--accent); stroke-width: 1.5; }
.proc.acc { fill: var(--accent-soft); stroke-width: 2; }
.ext { fill: var(--surface); stroke: var(--fg); stroke-width: 2; }
.dec { fill: var(--surface); stroke: var(--fg); stroke-width: 1.5; }
.loop { fill: none; stroke: var(--loop); stroke-width: 2; }
.dframe { fill: var(--surface); stroke: var(--rule); stroke-width: 1.2; }
.thread { stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 8 5; }
.sep { stroke: var(--rule); stroke-width: 1; }
.flow { stroke: currentColor; stroke-width: 1.3; fill: none; }
.flow.dash { stroke-dasharray: 4 3; }
.pname { font: 600 13.5px var(--mono); fill: var(--fg); }
.pcls { font: 400 11px var(--body); fill: var(--muted); }
.dname { font: 600 12px var(--body); fill: var(--fg); }
.ftitle { font: 700 11px var(--mono); fill: var(--loop); letter-spacing: .05em; }
.esub { font: 400 10.5px var(--body); fill: var(--muted); }
.flab { font: 400 10.5px var(--body); fill: var(--muted); }
.slot { font: 500 11px var(--mono); fill: var(--accent); }
.io { font: 500 11px var(--mono); fill: var(--store); }
.sname2 { font: 600 12px var(--mono); fill: var(--fg); }
.colh { font: 600 10.5px var(--body); fill: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.col { font: 600 11px var(--mono); fill: var(--muted); letter-spacing: .08em; }
.tbl { overflow-x: auto; border: 1px solid var(--rule); border-radius: 8px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th, td { text-align: left; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid var(--rule); }
th { font-weight: 600; background: var(--accent-soft); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
code { font: 500 12.5px var(--mono); white-space: nowrap; }
"""


def page(spec, svg):
    cap = []
    for part in spec.get("caption", []):
        if isinstance(part, dict) and "list" in part:
            cap.append("<ul>" + "".join(f"<li>{E(x)}</li>" for x in part["list"]) + "</ul>")
        else:
            cap.append(f"<p>{E(part)}</p>")
    uses = ""
    if spec.get("uses"):
        rows = "".join(f"<tr><td><code>{E(a)}</code></td><td>{E(b)}</td></tr>" for a, b in spec["uses"])
        uses = (f'<h2>{E(spec.get("uses_title", "O que cada classe usa"))}</h2>'
                f'<div class="tbl"><table><thead><tr><th>Classe</th><th>Usa</th></tr></thead><tbody>{rows}</tbody></table></div>')
    evidence = f'<p>{E(spec["evidence"])}</p>' if spec.get("evidence") else ""
    return f"""<title>{E(spec["title"])}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Layout: one wide figure that scrolls on its own; flow on the left, data on the right */
{PAGE_CSS}</style>
<div class="wrap">
<header>
  <div class="eyebrow">{E(spec.get("eyebrow", ""))}</div>
  <h1>{E(spec.get("heading", spec["title"]))}</h1>
  <p>{E(spec.get("intro", ""))}</p>
</header>
<div class="legend" aria-label="Legenda">
  <span><i class="k e"></i>entidade externa</span>
  <span><i class="k p"></i>chamada no código (o fundo azul marca as principais)</span>
  <span><i class="k l"></i>laço</span>
  <span><i class="k d"></i>decisão</span>
  <span><i class="k b"></i>tracejado: resposta ou recusa ao chamador</span>
</div>
<figure>
{svg}
<figcaption>{''.join(cap)}</figcaption>
</figure>
{uses}
{evidence}
</div>
"""


def main(argv):
    if len(argv) >= 2 and argv[0] == "--check":
        spec = json.load(open(argv[1], encoding="utf-8"))
        render(spec)
        print("spec válido")
        return 0
    if len(argv) < 2:
        print(__doc__)
        return 2
    spec = json.load(open(argv[0], encoding="utf-8"))
    svg = render(spec)
    open(argv[1], "w", encoding="utf-8").write(page(spec, svg))
    if "--svg" in argv:
        open(argv[argv.index("--svg") + 1], "w", encoding="utf-8").write(svg)
    print(f"escrito {argv[1]}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except SpecError as e:
        print(f"flowdiagram: {e}", file=sys.stderr)
        sys.exit(1)
