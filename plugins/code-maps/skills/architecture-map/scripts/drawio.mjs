#!/usr/bin/env node
// Tier 0: the architecture as a flow — the sketch's vocabulary of boxes (a cyan bar is a part of the system, an
// orange box a concrete piece inside it, an outlined box a contract, grey a planned or legacy piece), each box
// carrying its name and nothing else, joined by arrows that say how the system runs: the chain order the process
// file states (cyan, thick) and the relations the bytecode holds between parts (grey). Every box is still a set of
// classes resolved against the graph, so the picture claims only what it can prove. Written as uncompressed
// draw.io XML (open the file, or paste the <mxGraphModel> under Extras › Edit Diagram) with an SVG twin.
//
//   node drawio.mjs --graph graph.json --map doc.map.json --out doc.drawio [--svg doc.svg] [--sets main]
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dirname, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildModel } from '../../java-diagrams/scripts/model.mjs';
import { validate, applyRoot, resolve, project, subtreeUnits, expandable, shortId } from './core.mjs';
import { installed, install, depsDir, elkBundlePath } from './deps.mjs';

// ── the look, taken from the sketch
export const STYLE = {
  bar: { fill: '#1CB9F0', stroke: 'none', font: '#FFFFFF', bold: true, size: 15, body: '#F2FBFE' },
  row: { fill: '#BFBFBF', stroke: 'none', font: '#FFFFFF', bold: true, size: 15, body: '#FAFAFA' },
  box: { fill: '#F4802E', stroke: 'none', font: '#FFFFFF', bold: true, size: 13 },
  type: { fill: '#FFFFFF', stroke: '#1CB9F0', font: '#1CB9F0', bold: true, size: 13 },
  muted: { fill: '#BFBFBF', stroke: 'none', font: '#FFFFFF', bold: true, size: 13 },
  actor: { fill: '#C55A11', stroke: 'none', font: '#FFFFFF', bold: true, size: 13 },
};
export const EDGE = {
  flow: { color: '#1CB9F0', width: 3, dash: false, head: 'block' },
  uses: { color: '#8C8C8C', width: 1.5, dash: false, head: 'open' },
  implements: { color: '#8C8C8C', width: 1.5, dash: true, head: 'empty' },
  declared: { color: '#C55A11', width: 2, dash: true, head: 'block' },
  loop: { color: '#1CB9F0', width: 2, dash: true, head: 'block' },
};
const HEAD = 36, PAD = 14, BOX_H = 44;
const textW = (t, size) => Math.ceil(String(t).length * size * 0.62) + 28;

// ── which look a box takes: a group is a bar (or a grey row), a leaf of contracts only is outlined, planned/legacy grey
export function lookOf(ctx, n) {
  if (n.style) return n.style;
  if (n.kind === 'actor') return 'actor';
  if (n.children.length) return n.shape === 'row' ? 'row' : 'bar';
  if (n.planned || n.legacy) return 'muted';
  const units = subtreeUnits(ctx, n.id).map(u => ctx.model.units.get(u));
  if (units.length && units.every(u => ['interface', 'record', 'enum', 'annotation'].includes(u.kind) || u.abstract)) return 'type';
  return 'box';
}

// ── the chain order, read from the process file the document names. A `link: fetch` entry is the class whose
// name() returns "fetch" — read from the sources when they are given; without sources, FetchLink by convention
export function linkNames(sourcesDir) {
  const out = new Map(), grain = new Map();
  const walk = dir => { for (const f of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.java')) { const t = readFileSync(p, 'utf8'); const pk = t.match(/^package\s+([\w.]+);/m); if (!pk) continue; const id = pk[1] + '.' + f.name.replace(/\.java$/, ''); const m = t.match(/String\s+name\(\)\s*\{\s*return\s*"([a-z0-9-]+)"/); if (m) out.set(m[1], id); const g = t.match(/Grain\s+grain\(\)\s*\{\s*return\s+Grain\.(\w+)/); if (g) grain.set(id, g[1]); } } };
  walk(sourcesDir);
  out.grain = grain;
  return out;
}
export function chainOrder(ctx, processPath, sourcesDir) {
  const text = readFileSync(processPath, 'utf8');
  // one step per `- ` item under chain: its link, and its `when` (live / replay / both) — the file's own words for the branch
  // `chainLink:` since 2026-10-13 (the OEM build renamed Link → ChainLink so a step is never confused with a URL); `link:` still read
  const items = text.split(/^(?=\s*-\s)/m).filter(t => /^\s*-\s*(?:\{\s*)?(?:chainLink|link):/.test(t));
  const steps = items.map(t => ({ name: t.match(/(?:chainLink|link):\s*([a-z0-9-]+)/)[1], when: (t.match(/when:\s*(live|replay)/) || [])[1] || null }));
  const names = steps.map(x => x.name);
  if (!names.length) throw new Error(`${processPath}: no "chainLink:" (or "link:") entries under chain`);
  const stated = sourcesDir ? linkNames(sourcesDir) : new Map();
  const byName = new Map();
  for (const u of ctx.model.units.values()) { if (!byName.has(u.name)) byName.set(u.name, []); byName.get(u.name).push(u.id); }
  const classes = names.map(n => {
    if (stated.has(n)) { const id = stated.get(n); if (!ctx.model.units.has(id)) throw new Error(`${processPath}: link "${n}" is ${id} in the sources, which the graph does not hold`); return id; }
    const stem = n.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
    const cls = byName.has(stem + 'ChainLink') ? stem + 'ChainLink' : stem + 'Link';
    const hits = byName.get(cls) || [];
    if (hits.length !== 1) throw new Error(`${processPath}: link "${n}" → ${cls} by convention: ${hits.length ? hits.length + ' classes carry that name' : 'no such class in the graph'}${sourcesDir ? '' : ' (pass --sources to read the name() each link states)'}`);
    return hits[0];
  });
  // the grain a link states in its sources (TARGET unless it says PROCESS); without sources every link is TARGET
  steps.forEach((x, i) => { x.cls = classes[i]; x.grain = stated.grain?.get(classes[i]) || 'TARGET'; });
  return { names, classes, steps, stated: names.filter(n => stated.has(n)).length };
}

// ── what the picture draws: the chain flow between the boxes that own consecutive links, and the bytecode arrows
export function arrowsOf(ctx, proj, opts = {}) {
  // bands: the bytecode arrows between whole bands (the projection with nothing open), not between the pieces inside them
  const { nodes } = ctx;
  const box = id => id.endsWith('/own') ? id.slice(0, -4) : id;
  const parentOf = id => nodes.get(id)?.parent;
  const rootOf = id => { let x = id; while (parentOf(x) !== undefined) x = parentOf(x); return x; };
  const related = (a, b) => a === b || ctx.isAncestor(a, b) || ctx.isAncestor(b, a);
  // every arrow joins two siblings: an end inside a deeper box is lifted to the box that sits beside the other end
  // (the children of their nearest common box), so each band keeps its own layout and the flow between bands is one arrow
  const pathOf = id => { const p = []; for (let x = nodes.get(id); x; x = x.parent !== undefined ? nodes.get(x.parent) : null) p.unshift(x.id); return p; };
  const lift = (a, b) => { const pa = pathOf(a), pb = pathOf(b); let k = 0; while (k < pa.length - 1 && k < pb.length - 1 && pa[k] === pb[k]) k++; return [pa[k], pb[k]]; };
  const out = [], seen = new Set();
  const add = (from0, to0, kind, why, label, n) => { if (from0 === to0 || related(from0, to0)) return; const [from, to] = lift(from0, to0); const k = kind + '|' + from + '>' + to; if (from === to || seen.has(k)) return; seen.add(k); out.push({ from, to, kind, why, n: n || 1, ...(label ? { label } : {}) }); };
  if (opts.chain) {
    const owner = u => { const o = ctx.owner.get(u); if (!o) throw new Error(`chain link ${shortId(ctx.model, u)} is on no box`); let x = o; while (!proj.nodes.has(x) && parentOf(x) !== undefined) x = parentOf(x); return x; };
    const steps = (opts.chain.steps || opts.chain.classes.map((cls, i) => ({ cls, name: opts.chain.names[i], when: null, grain: 'TARGET' }))).map(x => ({ ...x, box: owner(x.cls) }));
    // the flow per mode: a step with `when` runs in that mode only, so live and replay are two paths that share the rest;
    // an arrow that only one mode walks says which; the step where the grain turns to PROCESS says so on its arrow
    const runner = opts.runner && proj.nodes.has(opts.runner) ? opts.runner : null;
    const walked = new Map();
    for (const mode of ['live', 'replay']) {
      const path = steps.filter(x => !x.when || x.when === mode);
      let prev = runner ? { box: runner, grain: 'TARGET' } : null;
      for (const x of path) { if (prev) { const k = prev.box + '>' + x.box; if (!walked.has(k)) walked.set(k, { from: prev.box, to: x.box, modes: new Set(), grainSwitch: x.grain === 'PROCESS', pos: steps.indexOf(x) }); walked.get(k).modes.add(mode); } prev = x; }
    }
    for (const w of walked.values()) { const parts = []; if (w.modes.size === 1) parts.push([...w.modes][0]); if (w.grainSwitch) parts.push('uma vez por processo'); add(w.from, w.to, 'flow', `chain order (${opts.chain.file})`, parts.join(' · ')); const a = out[out.length - 1]; if (a && a.kind === 'flow' && a.to === w.to) a.pos = w.pos; }
  }
  // loops the document declares, each with the line of code that holds it (drawn as a loop, never read into the code)
  for (const l of opts.loops || []) { const at = l.at ? [l.at, l.at] : [l.from, l.to]; if (!proj.nodes.has(at[0]) || !proj.nodes.has(at[1])) continue; const k = 'loop|' + at[0] + '>' + at[1] + '|' + l.label; if (seen.has(k)) continue; seen.add(k); out.push({ from: at[0], to: at[1], kind: 'loop', why: l.source, label: l.label }); }
  // bands: one arrow per pair of top-level bands; calls: the pairs where one class calls, creates, implements or extends
  // the other (what the flow passes through, not what it merely names); all: every pair
  const mode = opts.arrows || 'bands';
  const src = mode === 'bands' ? project(ctx, new Set()) : proj;
  const isCall = e => (e.kinds || []).some(k => ['calls', 'creates', 'implements', 'extends'].includes(k));
  // a class box with `entry` is on the picture for one of its methods (CommandRunner for `run`): a call it makes counts only
  // when the bytecode shows that method making it; where the evidence list is capped (more calls than entries) nothing is dropped
  const unitsUnder = id => new Set(subtreeUnits(ctx, id));
  // the raw graph is read per type (a nested type is its own edge, each list capped on its own), the model folds nested
  // types into their outer class and the folded list looks capped when it is not
  const outer = new Map((opts.graph?.types || []).map(t => [t.id, t.outer || t.id]));
  const rawFrom = new Map();
  for (const e of opts.graph?.edges || []) { const f = outer.get(e.from) || e.from; if (!rawFrom.has(f)) rawFrom.set(f, []); rawFrom.get(f).push(e); }
  const madeByEntry = (fromBox, toBox) => {
    const n = nodes.get(fromBox); if (!n || !n.entry || n.kind !== 'class') return true;
    const targets = unitsUnder(toBox); let complete = true, hit = false, any = false;
    const edges = rawFrom.size ? (rawFrom.get(n.unit) || []).map(e => ({ to: outer.get(e.to) || e.to, kinds: e.kinds })) : ctx.model.pairs.filter(q => q.from === n.unit);
    // `via` is the set of distinct caller→callee pairs, capped at VIA_LIMIT (8) by the extractor: a list at the cap may be cut
    for (const q of edges) { if (!targets.has(q.to)) continue; for (const k of ['calls', 'creates']) { const d = q.kinds[k]; if (!d) continue; any = true; const via = d.via || []; if (via.length >= 8) complete = false; if (via.some(v => v === n.entry || v.startsWith(n.entry + '→') || v.startsWith('lambda$' + n.entry + '$'))) hit = true; } }
    return !any || hit || !complete;
  };
  const onFlow = new Set(out.filter(e => e.kind === 'flow').flatMap(e => [e.from, e.to]));
  const flat = [...nodes.values()].every(n => !n.children.length);
  // upstream of the flow: a class that calls into it and that nothing on it calls back (the entry: CommandRunner → Maestro → Chain)
  const isCallPair = e => e.drawn && (e.kinds || []).some(k => ['calls', 'creates'].includes(k));
  for (let grew = true; grew;) { grew = false; for (const e of src.edges) { const a = box(e.from), b = box(e.to); if (!isCallPair(e) || onFlow.has(a) || !onFlow.has(b)) continue; if (src.edges.some(x => isCallPair(x) && onFlow.has(box(x.from)) && box(x.to) === a)) continue; onFlow.add(a); grew = true; } }
  if (mode !== 'flow') for (const e of src.edges) {
    if (!e.drawn || (mode === 'calls' && !isCall(e))) continue;
    const kind = e.rel === 'implements' || e.rel === 'extends' ? 'implements' : 'uses';
    // a flat picture of classes: a call arrow starts on the flow (what each class on it uses) or joins two classes beside it;
    // a side class calling back into the flow, and the flow's own `implements Link`, are read in the panel, not drawn
    if (flat && mode === 'calls') { const a = onFlow.has(box(e.from)), b = onFlow.has(box(e.to)); if (kind === 'uses' ? (!a && b) : (a || b)) continue; }
    if (kind === 'uses' && !madeByEntry(box(e.from), box(e.to))) continue;
    add(box(e.from), box(e.to), kind, e.tech || e.rel, undefined, e.n);
  }
  for (const d of src.declared) add(box(d.from), box(d.to), 'declared', d.label || 'declared');
  // the same relation both ways is one arrow with two heads
  const merged = [];
  const order = ctx.doc.nodes.map(n => n.id);
  const idx = id => order.indexOf(rootOf(id)) * 10000 + order.indexOf(id);
  for (const e of out) { const back = e.kind !== 'loop' && merged.find(m => m.kind === e.kind && m.from === e.to && m.to === e.from); if (back) { back.both = true; if (idx(back.from) > idx(back.to)) [back.from, back.to] = [back.to, back.from]; } else merged.push(e); }
  return merged;
}

// ── layout with ELK: containers for the groups, the flow left to right
export async function layoutTier0(ctx, proj, arrows, elkBundle) {
  const { nodes } = ctx;
  const title = n => n.title || (n.kind === 'class' ? ctx.model.units.get(n.unit).name : n.id);
  const ELK = createRequire(import.meta.url)(elkBundle);
  const elk = new ELK();
  const elkNode = new Map();
  const mk = id => {
    const n = nodes.get(id), look = lookOf(ctx, n);
    const node = n.children.length
      ? { id, layoutOptions: { 'elk.padding': `[top=${HEAD + PAD},left=${PAD},bottom=${PAD},right=${PAD}]`, 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${textW(title(n), STYLE.bar.size) + 40},${HEAD + 40})`, 'elk.spacing.nodeNode': '16', 'elk.layered.spacing.nodeNodeBetweenLayers': '36', 'elk.layered.spacing.edgeNodeBetweenLayers': '14', 'elk.spacing.edgeNode': '10', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.layered.crossingMinimization.forceNodeModelOrder': 'true' }, children: n.children.map(mk) }
      : { id, width: Math.max(96, textW(title(n), 13)), height: BOX_H };
    node.look = look; elkNode.set(id, node); return node;
  };
  const roots = [...nodes.values()].filter(n => n.parent === undefined && proj.nodes.has(n.id)).map(n => mk(n.id));
  // when every arrow joins two siblings, each box lays out on its own and keeps its `flow` (left to right unless said);
  // the bands then stack in the document's direction — UP puts the first band at the bottom, as the sketch has it
  const siblings = arrows.every(e => nodes.get(e.from).parent === nodes.get(e.to).parent);
  const flat = roots.every(r => !r.children);
  const dir = ctx.doc.layout?.direction || (flat ? 'RIGHT' : 'UP');
  if (flat) return flatLayout(ctx, roots, arrows, title);
  if (siblings) for (const [id, n] of elkNode) if (n.children) {
    n.layoutOptions['elk.direction'] = nodes.get(id).flow || 'RIGHT';
    n.layoutOptions['elk.contentAlignment'] = 'H_LEFT V_TOP';
    n.layoutOptions['elk.separateConnectedComponents'] = 'false';   // boxes with no arrows would otherwise be packed in a grid, partitions ignored
    if (!arrows.some(e => nodes.get(e.from).parent === id)) { n.layoutOptions['elk.partitioning.activate'] = 'true'; n.children.forEach((c, i) => { c.layoutOptions = { ...(c.layoutOptions || {}), 'elk.partitioning.partition': String(i) }; }); }
  }
  // the bands stack in document order, whatever the arrows between them say: the document is the statement of the stack
  if (siblings && !flat) roots.forEach((r, i) => { r.layoutOptions = { ...(r.layoutOptions || {}), 'elk.partitioning.partition': String(i) }; });
  const interactive = flat ? { 'elk.interactive': 'true', 'elk.layered.layering.strategy': 'INTERACTIVE', 'elk.layered.cycleBreaking.strategy': 'INTERACTIVE', 'elk.layered.crossingMinimization.strategy': 'INTERACTIVE', 'elk.layered.nodePlacement.strategy': 'INTERACTIVE', 'elk.separateConnectedComponents': 'false' } : {};
  const root = { id: 'root', layoutOptions: { ...interactive, 'elk.algorithm': 'layered', 'elk.partitioning.activate': siblings && !flat ? 'true' : 'false', 'elk.direction': siblings || flat ? dir : 'RIGHT', 'elk.hierarchyHandling': siblings ? 'SEPARATE_CHILDREN' : 'INCLUDE_CHILDREN', 'elk.edgeRouting': 'ORTHOGONAL', 'elk.spacing.nodeNode': '40', 'elk.layered.spacing.nodeNodeBetweenLayers': '70', 'elk.layered.spacing.edgeNodeBetweenLayers': '24', 'elk.spacing.edgeNode': '16', 'elk.spacing.edgeEdge': '12', 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.layered.crossingMinimization.forceNodeModelOrder': 'true', 'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH' }, children: roots, edges: [] };
  const pathOf = id => { const p = []; for (let x = nodes.get(id); x; x = x.parent !== undefined ? nodes.get(x.parent) : null) p.unshift(x.id); return p; };
  const lca = (a, b) => { const pa = pathOf(a), pb = pathOf(b); let k = 0; while (k < pa.length - 1 && k < pb.length - 1 && pa[k] === pb[k]) k++; return k === 0 ? root : elkNode.get(pa[k - 1]); };
  // where the bytecode runs both ways between two bands (a cycle), the document order says which way the stack goes:
  // an arrow that follows it keeps its direction, the other is the one ELK turns around
  const order = ctx.doc.nodes.map(n => n.id), rootOf = id => { let x = id; while (nodes.get(x).parent !== undefined) x = nodes.get(x).parent; return x; };
  const follows = e => order.indexOf(rootOf(e.from)) <= order.indexOf(rootOf(e.to)) && (rootOf(e.from) !== rootOf(e.to) || order.indexOf(e.from) < order.indexOf(e.to));
  arrows.forEach((e, i) => { e.id = 'e' + i; const c = lca(e.from, e.to); const opts = e.kind === 'flow' || follows(e) ? { 'elk.layered.priority.direction': '10', 'elk.layered.priority.shortness': e.kind === 'flow' ? '10' : '1', 'elk.layered.priority.straightness': e.kind === 'flow' ? '10' : '0' } : {}; if (e.kind === 'loop') Object.assign(opts, { 'elk.layered.priority.direction': '0' }); (c.edges ??= []).push({ id: e.id, sources: [e.from], targets: [e.to], layoutOptions: opts, labels: e.label ? [{ text: e.label, width: e.label.length * 6.5 + 8, height: 14 }] : [] }); });
  // ELK's model-order crossing minimisation throws on some inputs ("reading 'a'"); the plain options then do
  const plain = () => { const g = JSON.parse(JSON.stringify(root)); const strip = n => { if (n.layoutOptions) for (const k of ['elk.layered.considerModelOrder.strategy', 'elk.layered.crossingMinimization.forceNodeModelOrder', 'elk.layered.compaction.postCompaction.strategy']) delete n.layoutOptions[k]; (n.children || []).forEach(strip); }; strip(g); return g; };
  let g, usePlain = false;
  const run = async () => { if (!usePlain) { try { return await elk.layout(JSON.parse(JSON.stringify(root))); } catch (err) { console.warn('ELK failed with the model-order options; laying out with the plain ones: ' + (err.message || err)); usePlain = true; } } return elk.layout(plain()); };
  if (process.env.DRAWIO_DUMP) writeFileSync(process.env.DRAWIO_DUMP, JSON.stringify(root, null, 1));
  g = await run();
  // the bands share one width, as the sketch's bars do: a second pass with that width as every band's minimum
  if (siblings) {
    const widest = Math.max(...g.children.filter(c => c.children?.length).map(c => c.width));
    for (const c of root.children) if (c.children?.length) c.layoutOptions['elk.nodeSize.minimum'] = `(${Math.ceil(widest)},${HEAD + 40})`;
    g = await run();
  }
  const abs = new Map([['root', { x: 0, y: 0 }]]);
  const cells = [];
  const walk = (n, ox, oy, parent) => { for (const c of n.children || []) { const x = ox + c.x, y = oy + c.y; abs.set(c.id, { x, y }); const dn = nodes.get(c.id); cells.push({ id: c.id, parent, text: title(dn), look: c.look, x, y, rx: c.x, ry: c.y, w: c.width, h: c.height, group: !!(c.children && c.children.length) }); walk(c, x, y, c.id); } };
  walk(g, 0, 0, null);
  const collect = n => { for (const e of n.edges || []) { const o = abs.get(e.container || n.id) || { x: 0, y: 0 }; const s = e.sections?.[0]; if (!s) continue; const a = arrows.find(x => x.id === e.id); a.pts = [s.startPoint, ...(s.bendPoints || []), s.endPoint].map(p => [p.x + o.x, p.y + o.y]); const lb = e.labels?.[0]; if (lb && lb.x !== undefined) a.labelAt = [lb.x + o.x + lb.width / 2, lb.y + o.y + lb.height / 2]; } for (const c of n.children || []) collect(c); };
  collect(g);
  return { cells, arrows: arrows.filter(a => a.pts), width: g.width, height: g.height, title: ctx.doc.meta.title || 'Map' };
}

// ── the flat picture: the spine (the classes the flow walks, in order) in one row; what a spine class calls stacked
// below it, what calls it stacked above it; a class reached only through a side class sits next to that class
export function flatLayout(ctx, roots, arrows, title) {
  const ids = roots.map(r => r.id), byId = new Map(roots.map(r => [r.id, r]));
  const flow = arrows.filter(a => a.kind === 'flow');
  const nxt = new Map(), prv = new Map();
  for (const a of flow) { if (!nxt.has(a.from)) nxt.set(a.from, []); nxt.get(a.from).push(a.to); if (!prv.has(a.to)) prv.set(a.to, []); prv.get(a.to).push(a.from); }
  // the spine: walk the flow from its start in document order; a class with a single caller that calls nothing else on the
  // flow is put before it (Maestro before Chain)
  let start = ids.find(id => nxt.has(id) && !prv.has(id));
  const callers = id => arrows.filter(a => a.kind === 'uses' && a.to === id).map(a => a.from);
  const spine = [];
  // the step before: the one caller every other caller also calls (CommandRunner and GatherService both call Maestro,
  // CommandRunner also calls Chain directly: Maestro is the step, the two entries sit above it)
  const calls = (a, b) => arrows.some(x => x.kind === 'uses' && x.from === a && x.to === b);
  while (start) { const c = callers(start).filter(x => !spine.includes(x) && !nxt.has(x)); const last = c.filter(x => c.every(y => y === x || calls(y, x))); spine.unshift(start); start = last.length === 1 ? last[0] : null; }
  const seen = new Set(spine);
  for (const a of [...flow].sort((p, q) => (p.pos ?? 0) - (q.pos ?? 0))) if (!seen.has(a.to)) { seen.add(a.to); spine.push(a.to); }
  // side classes: below the first spine class that calls them, above the first they call; the rest beside what reaches them
  const below = new Map(spine.map(s => [s, []])), above = new Map(spine.map(s => [s, []]));
  const home = new Map();
  const place = (id, s, side) => { home.set(id, s); (side === 'below' ? below : above).get(s).push(id); };
  // a side class sits under the FIRST spine class (left to right) that calls it, so the original is always left of its copies; a caller sits above the first it calls
  const side = a => a.kind !== 'flow' && a.kind !== 'loop';
  const callees = new Map();
  for (const s of spine) for (const a of arrows) if (a.from === s && side(a) && !seen.has(a.to)) { if (!callees.has(a.to)) callees.set(a.to, { s, n: a.n || 1 }); }
  for (const s of spine) for (const [id, b] of callees) if (b.s === s && !home.has(id)) place(id, s, 'below');
  for (const s of spine) for (const a of arrows) if (a.to === s && side(a) && !seen.has(a.from) && !home.has(a.from)) place(a.from, s, 'above');
  let moved = true;
  while (moved) { moved = false; for (const a of arrows) { for (const [x, y] of [[a.from, a.to], [a.to, a.from]]) if (home.has(x) && !home.has(y) && !seen.has(y)) { const s = home.get(x); place(y, s, below.get(s).includes(x) ? 'below' : 'above'); moved = true; } } }
  for (const id of ids) if (!seen.has(id) && !home.has(id)) place(id, spine[spine.length - 1], 'below');
  // the original of a side class is drawn in the LEFTMOST column that reaches it (spine class or a side class of that
  // column), so the first box a reader meets is the original and every copy is to its right
  const colIdx = id => spine.indexOf(spine.includes(id) ? id : home.get(id));
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const id of ids) {
      if (spine.includes(id) || !home.has(id)) continue;
      const first = Math.min(...arrows.filter(a => side(a) && a.to === id && a.from !== id).map(a => colIdx(a.from)).filter(i => i >= 0));
      if (first < colIdx(id)) { below.get(home.get(id)).splice(below.get(home.get(id)).indexOf(id), 1); above.get(home.get(id)).includes(id) && above.get(home.get(id)).splice(above.get(home.get(id)).indexOf(id), 1); place(id, spine[first], 'below'); changed = true; }
    }
    if (!changed) break;
  }
  // a class may be drawn again, marked, wherever another column calls it: the arrow then stays inside the column instead of
  // crossing the sheet; the copy is '<id>@<spine class>' and carries only the arrows of that column
  const colOfNode = id => spine.includes(id) ? id : home.get(id);
  const copies = new Map();
  const copyIn = (id, s) => { const k = id + '@' + s; if (!copies.has(k)) { const o = byId.get(id); const c = { ...o, id: k, of: id, repeat: true }; byId.set(k, c); copies.set(k, c); roots.push(c); home.set(k, s); below.get(s).push(k); } return k; };
  for (const a of arrows) {
    if (a.kind === 'flow' || a.kind === 'loop' || spine.includes(a.to)) continue;
    const col = colOfNode(a.from); if (col === undefined || colOfNode(a.to) === col) continue;
    a.to = copyIn(a.to, col);
  }
  // the grid: the spine in one row; a spine class's column is the class and, to its right, the classes it calls stacked
  // below the row and the classes that call it stacked above; lanes above the row carry the loops and the arrows that skip
  // a step, lanes below carry the calls that reach another column
  const GX = 48, GY = 26, ROW = 44, LANE = 24;
  const loops = arrows.filter(a => a.kind === 'loop'), skips = arrows.filter(a => a.kind === 'flow' && spine.indexOf(a.to) - spine.indexOf(a.from) !== 1);
  const topLanes = loops.length + skips.length, maxAbove = Math.max(0, ...spine.map(s => above.get(s).length));
  const y0 = (topLanes + 1) * LANE + maxAbove * (ROW + GY) + 20;
  let x = 20;
  const colOf = new Map();
  for (const s of spine) {
    const n = byId.get(s), col = [...above.get(s), ...below.get(s)];
    const w = Math.max(...col.map(c => byId.get(c).width), 0);
    n.x = x; n.y = y0;
    const sx = x + n.width + GX / 2;
    above.get(s).forEach((c, i) => { const m = byId.get(c); m.x = sx; m.y = y0 - (i + 1) * (ROW + GY); });
    below.get(s).forEach((c, i) => { const m = byId.get(c); m.x = sx; m.y = y0 + (i + 1) * (ROW + GY); });
    const ss = arrows.filter(a => a.kind !== 'loop' && !spine.includes(a.from) && !spine.includes(a.to) && home.get(a.from) === s && home.get(a.to) === s).length;
    const lasso = arrows.some(a => a.kind === 'loop' && a.from === a.to && home.get(a.from) === s);
    colOf.set(s, { x0: x, x1: sx + w, sx, trunk: sx + w + (lasso ? 28 : 10) });
    x = (col.length ? sx + w : x + n.width) + Math.max(GX, (lasso ? 28 : 10) + ss * 8 + 20);
  }
  const bottom = Math.max(...roots.map(r => r.y + r.height));
  const cells = roots.map(r => ({ id: r.id, parent: null, text: title(ctx.nodes.get(r.of || r.id)), look: r.look, x: r.x, y: r.y, rx: r.x, ry: r.y, w: r.width, h: r.height, group: false, repeat: !!r.repeat }));
  // routes
  const B = id => byId.get(id), cx = n => n.x + n.width / 2, cy = n => n.y + n.height / 2;
  let top = 0, low = 0;
  const topLane = () => y0 - maxAbove * (ROW + GY) - 20 - (++top) * LANE, lowLane = () => bottom + 20 + (++low) * LANE;
  const lw = l => (l ? l.length * 5.6 + 8 : 0);
  arrows.forEach((a, i) => { if (!a.id) a.id = 'e' + i; });
  const isSkip = a => a.kind === 'flow' && spine.includes(a.from) && spine.includes(a.to) && spine.indexOf(a.to) - spine.indexOf(a.from) !== 1;
  // what attaches to the TOP edge of a spine box — loops, skips, callers above — each gets its own x, spread left to right
  // by where it goes, so no two arrowheads land on the same point; a self-loop on a spine box is a small lasso over it,
  // on a side box a lasso to its right, never a line through the boxes stacked above
  const topAtt = new Map(spine.map(s => [s, []]));
  for (const a of arrows) {
    const f = B(a.from), t = B(a.to);
    if (a.kind === 'loop' && a.from === a.to) { if (spine.includes(a.from)) topAtt.get(a.from).push({ a, end: 'from', dir: 0 }, { a, end: 'to', dir: 0.1 }); continue; }
    if (a.kind === 'loop' || isSkip(a)) { if (spine.includes(a.from)) topAtt.get(a.from).push({ a, end: 'from', dir: Math.sign(cx(t) - cx(f)) }); if (spine.includes(a.to)) topAtt.get(a.to).push({ a, end: 'to', dir: Math.sign(cx(f) - cx(t)) }); continue; }
    if (spine.includes(a.to) && !spine.includes(a.from) && home.get(a.from) === a.to) topAtt.get(a.to).push({ a, end: 'to', dir: Math.sign(cx(f) - cx(t)) });
  }
  const slot = new Map();
  for (const [s, list] of topAtt) { const n = B(s); list.sort((p, q) => p.dir - q.dir); list.forEach((p, i) => slot.set(p.a.id + '|' + p.end, n.x + n.width * (i + 1) / (list.length + 1))); }
  const sx = (a, end, n) => slot.get(a.id + '|' + end) ?? cx(n);
  // side-to-side arrows of one column share a trunk zone right of the column: the shorter the span, the nearer the boxes
  const ssK = new Map();
  for (const s of spine) { const list = arrows.filter(a => a.kind !== 'loop' && !spine.includes(a.from) && !spine.includes(a.to) && home.get(a.from) === s && home.get(a.to) === s).sort((p, q) => Math.abs(B(p.from).y - B(p.to).y) - Math.abs(B(q.from).y - B(q.to).y)); list.forEach((a, i) => ssK.set(a.id, i)); }
  for (const a of arrows) {
    const f = B(a.from), t = B(a.to);
    const sf = spine.includes(a.from), st = spine.includes(a.to);
    if (a.kind === 'loop' && a.from === a.to) {
      if (sf) { const x1 = sx(a, 'from', f), x2 = sx(a, 'to', f), y = f.y - 18; a.pts = [[x1, f.y], [x1, y], [x2, y], [x2, f.y]]; a.labelAt = [(x1 + x2) / 2, y - 7]; }
      else { const r = f.x + f.width; a.pts = [[r, cy(f) - 9], [r + 14, cy(f) - 9], [r + 14, cy(f) + 9], [r, cy(f) + 9]]; a.labelAt = [r + 20 + lw(a.label) / 2, cy(f)]; }
      continue;
    }
    if (a.kind === 'loop' || isSkip(a)) { const y = topLane(), x1 = sx(a, 'from', f), x2 = sx(a, 'to', t); a.pts = [[x1, f.y], [x1, y], [x2, y], [x2, t.y]]; a.lane = y; continue; }
    if (sf && st) { a.pts = [[f.x + f.width, cy(f)], [t.x, cy(t)]]; a.labelAt = [(f.x + f.width + t.x) / 2, cy(f) - 8]; continue; }
    if (sf && home.get(a.to) === a.from) { const trunk = t.x - 12; a.pts = [[f.x + f.width, cy(f)], [trunk, cy(f)], [trunk, cy(t)], [t.x, cy(t)]]; continue; }   // a call into its own column
    if (st && home.get(a.from) === a.to) { const x2 = sx(a, 'to', t); a.pts = [[f.x, cy(f)], [x2, cy(f)], [x2, t.y]]; continue; }                                 // a caller above its column
    if (!sf && !st && home.get(a.from) === home.get(a.to)) { const r = colOf.get(home.get(a.from)).trunk + (ssK.get(a.id) || 0) * 8; a.pts = [[f.x + f.width, cy(f)], [r, cy(f)], [r, cy(t)], [t.x + t.width, cy(t)]]; continue; }   // side to side in one column
    if (f.y < y0 && t.y <= y0) { const y = topLane(); a.pts = [[cx(f), f.y], [cx(f), y], [cx(t), y], [cx(t), t.y]]; continue; }   // from above the row into another column: over the top
    const y = lowLane(); a.pts = [[cx(f), f.y + f.height], [cx(f), y], [cx(t), y], [cx(t), t.y + t.height]];   // a call that reaches another column: under the sheet
  }
  // a lane label sits just above its lane, at the first spot along the lane that no other vertical crosses and no
  // other label occupies; the middle of the lane only when there is no such spot
  const verts = arrows.filter(a => a.pts).flatMap(a => { const v = []; for (let i = 1; i < a.pts.length; i++) if (Math.abs(a.pts[i][0] - a.pts[i - 1][0]) < 0.5) v.push({ a, x: a.pts[i][0], y1: Math.min(a.pts[i][1], a.pts[i - 1][1]), y2: Math.max(a.pts[i][1], a.pts[i - 1][1]) }); return v; });
  const placed = [];
  for (const a of arrows.filter(a => a.lane !== undefined && a.label)) {
    const w = lw(a.label), y = a.lane - 7, xa = Math.min(a.pts[1][0], a.pts[2][0]), xb = Math.max(a.pts[1][0], a.pts[2][0]);
    const free = x => !verts.some(v => v.a !== a && v.x > x - w / 2 - 4 && v.x < x + w / 2 + 4 && v.y1 < y + 6 && v.y2 > y - 6) && !placed.some(p => Math.abs(p.y - y) < 12 && p.x1 < x + w / 2 + 4 && p.x2 > x - w / 2 - 4);
    let x = null;
    for (let c = xa + 12 + w / 2; c <= xb - 12 - w / 2; c += 16) if (free(c)) { x = c; break; }
    if (x === null) x = (xa + xb) / 2;
    a.labelAt = [x, y]; placed.push({ x1: x - w / 2, x2: x + w / 2, y });
  }
  const legendY = bottom + 20 + (low + 1) * LANE + 16;
  // the modes phrase only when a flow arrow carries one: a process file with no `when:` has one path
  const modes = arrows.some(a => a.kind === 'flow' && /\b(live|replay)\b/.test(a.label || ''));
  const lines = LEGEND.map((l, i) => i === 0 && !modes ? l.replace(' — «live» / «replay»: só nesse modo;', ';') : l);
  const legend = { x: 20, y: legendY, lines };
  const width = Math.max(...roots.map(r => r.x + r.width)) + 20, height = legendY + 16 * lines.length + 20;
  return { cells, arrows: arrows.filter(a => a.pts), width, height, title: ctx.doc.meta.title || 'Map', spine, legend };
}

// the legend of the flat picture, one line per mark (pt-PT, like the flow labels the generator writes)
const LEGEND = [
  'ciano: o passo seguinte da chain — «live» / «replay»: só nesse modo; «uma vez por processo»: passo de grão PROCESS, corre depois de todos os alvos',
  'ciano tracejado: um ciclo, com o que repete (a linha de código que o tem está no documento do mapa)',
  'cinzento: chama (lido do bytecode); cinzento tracejado de ponta vazia: implementa',
  'caixa tracejada, esbatida e em itálico: a mesma classe, já desenhada mais à esquerda; laranja: classe; contorno azul: contrato',
];

// where along a polyline a label point falls: draw.io places an edge label at x ∈ [-1, 1] of the edge's length plus an
// offset in pixels, so the layout's absolute label position becomes the nearest point on the line and the rest
function labelGeometry(pts, at) {
  let best = { d: Infinity, t: 0, p: pts[0] }, total = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push({ a: pts[i - 1], b: pts[i], l, start: total }); total += l; }
  for (const sg of segs) {
    if (sg.l === 0) continue;
    const u = Math.max(0, Math.min(1, ((at[0] - sg.a[0]) * (sg.b[0] - sg.a[0]) + (at[1] - sg.a[1]) * (sg.b[1] - sg.a[1])) / (sg.l * sg.l)));
    const p = [sg.a[0] + u * (sg.b[0] - sg.a[0]), sg.a[1] + u * (sg.b[1] - sg.a[1])], d = Math.hypot(at[0] - p[0], at[1] - p[1]);
    if (d < best.d) best = { d, t: (sg.start + u * sg.l) / (total || 1), p };
  }
  return { x: +(best.t * 2 - 1).toFixed(3), dx: Math.round(at[0] - best.p[0]), dy: Math.round(at[1] - best.p[1]) };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toDrawio(lay) {
  const out = [];
  for (const c of lay.cells) {
    const s = STYLE[c.look] || STYLE.box;
    const style = c.group
      ? `swimlane;rounded=1;arcSize=6;startSize=${HEAD};html=1;fillColor=${s.fill};strokeColor=none;fontColor=${s.font};fontStyle=1;fontSize=${s.size};swimlaneFillColor=${s.body};collapsible=0;`
      : `rounded=1;arcSize=${Math.round(1000 / Math.min(c.w, c.h))};whiteSpace=wrap;html=1;fillColor=${s.fill};strokeColor=${c.repeat ? (s.stroke === 'none' ? s.fill : s.stroke) : s.stroke};strokeWidth=2;fontColor=${s.font};fontSize=${s.size};fontStyle=${(s.bold ? 1 : 0) | (c.repeat ? 2 : 0)}${c.repeat ? ';dashed=1;opacity=55' : ''};align=center;verticalAlign=middle;`;
    out.push(`    <mxCell id="${esc(c.id)}" value="${esc(c.text)}" style="${style}" vertex="1" parent="${esc(c.parent || '1')}"><mxGeometry x="${c.parent ? c.rx : c.x}" y="${c.parent ? c.ry : c.y}" width="${c.w}" height="${c.h}" as="geometry"/></mxCell>`);
  }
  for (const a of lay.arrows) {
    const s = EDGE[a.kind];
    const head = `${s.head === 'open' ? 'open' : 'block'}`, fill = s.head === 'empty' ? 0 : 1;
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=${s.color};strokeWidth=${s.width};${s.dash ? 'dashed=1;' : ''}endArrow=${head};endFill=${fill};endSize=8;${a.both ? `startArrow=${head};startFill=${fill};startSize=8;` : ''}`;
    const pts = a.pts.slice(1, -1).map(p => `<mxPoint x="${Math.round(p[0])}" y="${Math.round(p[1])}"/>`).join('');
    const lab = a.label && a.labelAt ? labelGeometry(a.pts, a.labelAt) : null;
    out.push(`    <mxCell id="${esc(a.id)}" value="${esc(a.label || '')}" style="${style}${a.label ? 'fontSize=11;fontColor=' + s.color + ';labelBackgroundColor=#FFFFFF;' : ''}" edge="1" parent="1" source="${esc(a.from)}" target="${esc(a.to)}"><mxGeometry relative="1"${lab ? ` x="${lab.x}" y="0"` : ''} as="geometry">${pts ? `<Array as="points">${pts}</Array>` : ''}${lab ? `<mxPoint x="${lab.dx}" y="${lab.dy}" as="offset"/>` : ''}</mxGeometry></mxCell>`);
  }
  if (lay.legend) out.push(`    <mxCell id="legend" value="${esc(lay.legend.lines.join('<br>'))}" style="text;html=1;align=left;verticalAlign=top;fontSize=11;fontColor=#555555;strokeColor=none;fillColor=none;whiteSpace=wrap;" vertex="1" parent="1"><mxGeometry x="${lay.legend.x}" y="${lay.legend.y}" width="${Math.min(900, Math.round(lay.width) - 40)}" height="${16 * lay.legend.lines.length}" as="geometry"/></mxCell>`);
  return `<mxfile host="code-maps" modified="${new Date().toISOString()}" agent="code-maps architecture-map" version="24.0.0" type="device">
  <diagram name="${esc(lay.title)}" id="tier0">
  <mxGraphModel dx="${Math.round(lay.width)}" dy="${Math.round(lay.height)}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.ceil((lay.width + 80) / 10) * 10}" pageHeight="${Math.ceil((lay.height + 80) / 10) * 10}" math="0" shadow="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
${out.join('\n')}
  </root>
  </mxGraphModel>
  </diagram>
</mxfile>
`;
}

export function toSvg(lay) {
  const M = 20, F = 'Segoe UI, Helvetica, Arial, sans-serif';
  const el = [];
  for (const c of lay.cells) {
    const s = STYLE[c.look] || STYLE.box;
    if (c.group) el.push(`<rect x="${c.x + M}" y="${c.y + M}" width="${c.w}" height="${c.h}" rx="8" fill="${s.body}" stroke="${s.fill}" stroke-width="2"/><path d="M${c.x + M + 8} ${c.y + M}h${c.w - 16}a8 8 0 0 1 8 8v${HEAD - 8}h-${c.w}v-${HEAD - 8}a8 8 0 0 1 8-8z" fill="${s.fill}"/><text x="${c.x + M + c.w / 2}" y="${c.y + M + HEAD / 2 + 5}" text-anchor="middle" font-family="${F}" font-size="${s.size}" font-weight="700" fill="${s.font}">${esc(c.text)}</text>`);
    else el.push(`<g${c.repeat ? ' opacity="0.55"' : ''}><rect x="${c.x + M}" y="${c.y + M}" width="${c.w}" height="${c.h}" rx="10" fill="${s.fill}" stroke="${c.repeat ? (s.stroke === 'none' ? s.fill : s.stroke) : (s.stroke === 'none' ? 'none' : s.stroke)}" stroke-width="2"${c.repeat ? ' stroke-dasharray="5 4"' : ''}/><text x="${c.x + M + c.w / 2}" y="${c.y + M + c.h / 2 + 5}" text-anchor="middle"${c.repeat ? ' font-style="italic"' : ''} font-family="${F}" font-size="${s.size}" font-weight="700" fill="${s.font}">${esc(c.text)}</text></g>`);
  }
  const defs = Object.entries(EDGE).map(([k, s]) => `<marker id="m-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${s.head === 'open' ? 7 : 8}" markerHeight="${s.head === 'open' ? 7 : 8}" orient="auto-start-reverse">${s.head === 'open' ? `<path d="M1 1L9 5L1 9" fill="none" stroke="${s.color}" stroke-width="1.5"/>` : `<path d="M0 0L10 5L0 10z" fill="${s.head === 'empty' ? '#fff' : s.color}" stroke="${s.color}"/>`}</marker>`).join('');
  for (const a of lay.arrows) { const s = EDGE[a.kind]; el.push(`<polyline points="${a.pts.map(p => `${p[0] + M},${p[1] + M}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width}"${s.dash ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#m-${a.kind})"${a.both ? ` marker-start="url(#m-${a.kind})"` : ''}/>`); if (a.label) { const [lx, ly] = a.labelAt || a.pts[Math.floor(a.pts.length / 2)]; const w = a.label.length * 6.5 + 8; el.push(`<rect x="${lx + M - w / 2}" y="${ly + M - 8}" width="${w}" height="16" fill="#fff"/><text x="${lx + M}" y="${ly + M + 4}" text-anchor="middle" font-family="${F}" font-size="11" fill="${s.color}">${esc(a.label)}</text>`); } }
  if (lay.legend) lay.legend.lines.forEach((l, i) => el.push(`<text x="${lay.legend.x + M}" y="${lay.legend.y + M + 12 + 16 * i}" font-family="${F}" font-size="11" fill="#555">${esc(l)}</text>`));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(lay.width + 2 * M)}" height="${Math.ceil(lay.height + 2 * M)}" viewBox="0 0 ${Math.ceil(lay.width + 2 * M)} ${Math.ceil(lay.height + 2 * M)}"><defs>${defs}</defs><rect width="100%" height="100%" fill="#fff"/>${el.join('')}</svg>`;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
async function main() {
  const args = process.argv.slice(2);
  const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  if (!opt('--graph') || !opt('--map') || !opt('--out')) { console.error('usage: node drawio.mjs --graph graph.json --map doc.map.json --out doc.drawio [--svg doc.svg] [--sources src/main/java] [--sets main]'); process.exit(2); }
  const graph = JSON.parse(readFileSync(opt('--graph'), 'utf8'));
  const model = buildModel(graph, { sets: (opt('--sets') || 'main').split(',') });
  const doc = JSON.parse(readFileSync(opt('--map'), 'utf8'));
  const errs = validate(doc); if (errs.length) { console.error('refused:\n  ' + errs.join('\n  ')); process.exit(2); }
  if (doc.meta.tier !== 0) { console.error('drawio.mjs draws tier 0 only (meta.tier: 0)'); process.exit(2); }
  const rootErr = applyRoot(doc, model); if (rootErr) { console.error('refused: ' + rootErr); process.exit(2); }
  const ctx = resolve(doc, model); if (ctx.errors.length) { console.error('refused:\n  ' + ctx.errors.join('\n  ')); process.exit(2); }
  const all = new Set([...ctx.nodes.values()].filter(expandable).map(n => n.id));
  const proj = project(ctx, all);
  let chain = null;
  if (doc.meta.process) { const file = resolvePath(dirname(opt('--map')), doc.meta.process); try { chain = { ...chainOrder(ctx, file, opt('--sources')), file: doc.meta.process }; } catch (e) { console.error('refused: ' + e.message); process.exit(2); } }
  const arrows = arrowsOf(ctx, proj, { chain, arrows: doc.layout?.arrows, runner: doc.meta.chainRunner, loops: doc.edges?.loops, graph });
  if (!installed()) { console.log(`installing ELK (one time) into ${depsDir()}`); if (!install()) { console.error('npm install failed'); process.exit(2); } }
  const lay = await layoutTier0(ctx, proj, arrows, elkBundlePath());
  mkdirSync(dirname(opt('--out')) || '.', { recursive: true });
  writeFileSync(opt('--out'), toDrawio(lay));
  if (opt('--svg')) writeFileSync(opt('--svg'), toSvg(lay));
  const n = k => lay.arrows.filter(a => a.kind === k).length, repeats = lay.cells.filter(c => c.repeat).length;
  console.log(`tier 0: ${lay.cells.length} boxes, ${model.units.size - ctx.unowned.length} of ${model.units.size} classes on the picture (${ctx.unowned.length} off it); arrows: ${n('flow')} chain${chain ? ` (${chain.names.length} links in ${chain.file}, ${chain.stated} named by their sources, ${chain.steps.filter(x => x.when).length} with when, ${chain.steps.filter(x => x.grain === 'PROCESS').length} PROCESS-grain)` : ''}, ${n('loop')} loops, ${n('uses')} uses, ${n('implements')} implements, ${n('declared')} declared (${lay.arrows.filter(a => a.both).length} both ways); ${repeats} repeated boxes; ${Math.round(lay.width)}×${Math.round(lay.height)} px → ${opt('--out')}${opt('--svg') ? ' + ' + opt('--svg') : ''}`);
}
