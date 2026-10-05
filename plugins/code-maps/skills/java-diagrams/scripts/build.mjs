#!/usr/bin/env node
// graph.json -> every view, laid out by Graphviz, verified, and packed into one HTML page.
//
//   node build.mjs graph.json --out diagrams.html [--title "Name"] [--notes notes.json]
//                             [--dot-dir dir] [--sets main,test] [--report verify.json]
//
// Exit 0 only if every view passes verification. Exit 1 lists what failed. Nothing is written
// to --out when verification fails, so a broken diagram cannot be shown by accident.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installed, loadGraphviz } from './deps.mjs';
import { buildModel, allViews, toDot, nodeText, relLabel, multiplicity, kindSummary, CAPS, INK } from './model.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const graphPath = args[0];
if (!graphPath || graphPath.startsWith('--')) {
  console.error('usage: node build.mjs graph.json --out diagrams.html [--title T] [--notes notes.json] [--dot-dir dir] [--sets main,test] [--report verify.json]');
  process.exit(2);
}
if (!installed()) {
  console.error('Graphviz is not installed yet. Run through run.mjs once; it installs it.');
  process.exit(2);
}
const graphviz = await loadGraphviz();

const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const model = buildModel(graph, { sets: (opt('--sets') || 'main').split(',') });
if (!model.units.size) { console.error('graph.json holds no types for the chosen sets'); process.exit(2); }
const notes = opt('--notes') ? JSON.parse(readFileSync(opt('--notes'), 'utf8')) : {};
const views = allViews(model);

// ───────────── verification ─────────────
const failures = [];
const fail = (view, msg) => failures.push(`${view}: ${msg}`);

// 0. the model itself: every extracted edge is in a pair or inside one unit
{
  const known = new Set(graph.types.filter(t => model.sets.includes(t.set)).map(t => t.id));
  const raw = graph.edges.filter(e => known.has(e.from) && known.has(e.to)).length;
  const kept = new Set(model.pairs.map(p => p.from + ' ' + p.to)).size;
  if (kept !== model.pairs.length) fail('model', 'duplicate unit pairs');
  if (raw < model.pairs.length) fail('model', 'more pairs than extracted edges');
  for (const p of model.pairs) if (!model.units.has(p.from) || !model.units.has(p.to)) fail('model', `pair names an unknown unit ${p.from} -> ${p.to}`);
}

const drawnAlone = new Uint8Array(model.pairs.length);
const rendered = [];
let t0 = Date.now();
for (const view of views) {
  // 1. accounting, re-derived from the raw pairs rather than trusted from the view builder:
  //    each pair in scope whose ends sit on different nodes is covered by exactly one edge
  //    between those two nodes, and no edge covers anything else.
  const covered = new Map();
  for (const e of view.edges) {
    for (const i of e.covers) {
      if (covered.has(i)) fail(view.id, `pair ${i} covered twice`);
      covered.set(i, e);
    }
    if (e.kind !== 'agg' && e.covers.length !== 1) fail(view.id, `edge ${e.id} is drawn as one relation but covers ${e.covers.length}`);
  }
  const inScope = scopeTest(view);
  const nodeById = new Map(view.nodes.map(n => [n.id, n]));
  let expected = 0, hiddenInside = 0;
  for (const p of model.pairs) {
    if (!inScope(p)) { if (covered.has(p.i)) fail(view.id, `edge covers out-of-scope pair ${p.from} -> ${p.to}`); continue; }
    let a = view.unitNode.get(p.from), b = view.unitNode.get(p.to);
    if (view.kind !== 'focus' && a !== undefined && b !== undefined && a !== b) {
      const na = nodeById.get(a), nb = nodeById.get(b);
      if (!na.inside && na.type !== 'unit') b = 'scope';
      else if (!nb.inside && nb.type !== 'unit') a = 'scope';
    }
    if (a === undefined || b === undefined) { fail(view.id, `in-scope pair has an end that is on no node: ${p.from} -> ${p.to}`); continue; }
    if (a === b) { hiddenInside++; if (covered.has(p.i)) fail(view.id, `same-node pair drawn as an edge`); continue; }
    expected++;
    const e = covered.get(p.i);
    if (!e) fail(view.id, `MISSING relation ${p.from} -> ${p.to}`);
    else if (e.from !== a || e.to !== b) fail(view.id, `relation ${p.from} -> ${p.to} drawn between the wrong nodes`);
    else if (e.kind !== 'agg') {
      drawnAlone[p.i] = 1;
      if (e.kind !== p.rel) fail(view.id, `relation ${p.from} -> ${p.to} is ${p.rel} but drawn as ${e.kind}`);
    }
  }
  if (covered.size !== expected) fail(view.id, `edges cover ${covered.size} pairs, scope has ${expected}`);

  // 2. rendering: every node and edge of the view is in the SVG, joined to the right ends
  const dot = toDot(model, view);
  let svg;
  try { svg = graphviz.dot(dot); } catch (err) { fail(view.id, 'Graphviz rejected the DOT: ' + String(err.message || err).split('\n')[0]); continue; }
  const found = { node: new Set(), edge: new Map() };
  for (const m of svg.matchAll(/<g id="([^"]+)" class="(node|edge)[^"]*">\s*<title>([^<]*)<\/title>/g)) {
    if (m[2] === 'node') found.node.add(m[1]);
    else found.edge.set(m[1], m[3].replace(/&#45;/g, '-').replace(/&gt;/g, '>'));
  }
  for (const n of view.nodes) if (!found.node.has(n.id)) fail(view.id, `node ${n.key} missing from the drawing`);
  if (found.node.size !== view.nodes.length) fail(view.id, `drawing has ${found.node.size} nodes, view has ${view.nodes.length}`);
  for (const e of view.edges) {
    const title = found.edge.get(e.id);
    if (!title) { fail(view.id, `edge ${e.id} missing from the drawing`); continue; }
    const ends = title.split('->').sort().join(' ');
    if (ends !== [e.from, e.to].map(x => x === 'scope' ? e.anchor : x).sort().join(' ')) fail(view.id, `edge ${e.id} drawn between ${title}`);
  }
  if (found.edge.size !== view.edges.length) fail(view.id, `drawing has ${found.edge.size} edges, view has ${view.edges.length}`);

  rendered.push({ view, dot, svg: tidy(svg), hiddenInside });
}
const layoutMs = Date.now() - t0;

function scopeTest(view) {
  if (view.kind === 'focus') return p => p.from === view.focus || p.to === view.focus;
  if (view.kind === 'classes') { const own = new Set(model.packages.get(view.pkg).units); return p => own.has(p.from) || own.has(p.to); }
  const inside = id => { const q = model.units.get(id).pkg; return q === view.pkg || view.pkg === '' || q.startsWith(view.pkg + '.'); };
  return p => inside(p.from) || inside(p.to);
}

function tidy(svg) {
  return svg
    .replace(/^[\s\S]*?(<svg)/, '$1')
    .replace(/<!--[\s\S]*?-->\n?/g, '')
    .replace(/<title>[^<]*<\/title>\n?/g, '')
    .replace(/<polygon fill="(white|transparent|none)" stroke="(none|transparent)" points="[^"]*"\/>\n/, '')
    .replace(/ xmlns:xlink="[^"]*"/, '')
    .replace(/ xml:space="preserve"/g, '')
    .replace(/ font-family="[^"]*"/g, '');
}

// 3. the whole: every relationship is drawn as its own arrow in at least one view
const neverAlone = model.pairs.filter(p => !drawnAlone[p.i]);

const sizes = { packages: 0, classes: 0, focus: 0 };
let maxNodes = 0, maxEdges = 0, stackedViews = 0, foldedViews = 0;
for (const r of rendered) {
  sizes[r.view.kind]++;
  maxNodes = Math.max(maxNodes, r.view.nodes.length);
  maxEdges = Math.max(maxEdges, r.view.edges.length);
  if (r.view.stacked) stackedViews++;
  if (r.view.folded) foldedViews++;
}
const report = {
  ok: failures.length === 0,
  types: model.rawTypes, classes: model.units.size, packages: model.packages.size, relationships: model.pairs.length,
  extractedEdges: model.rawEdges, insideOneClass: model.foldedInternal,
  views: { ...sizes, total: rendered.length }, largestView: { nodes: maxNodes, edges: maxEdges },
  viewsUsingStacks: stackedViews, viewsUsingMoreNode: foldedViews,
  relationshipsDrawnAsOwnArrow: model.pairs.length - neverAlone.length,
  relationshipsOnlyInsideCounts: neverAlone.slice(0, 50).map(p => `${p.from} -> ${p.to}`),
  layoutMs, failures: failures.slice(0, 200), failureCount: failures.length,
};
if (opt('--report')) { mkdirSync(dirname(opt('--report')) || '.', { recursive: true }); writeFileSync(opt('--report'), JSON.stringify(report, null, 2)); }

console.log(`${model.units.size} classes (${model.rawTypes} types with nested), ${model.packages.size} packages, ${model.pairs.length} relationships`);
console.log(`${rendered.length} views: ${sizes.packages} package, ${sizes.classes} class, ${sizes.focus} focus — laid out in ${layoutMs} ms`);
console.log(`largest view: ${maxNodes} nodes, ${maxEdges} arrows; ${stackedViews} views stack identical nodes, ${foldedViews} use an "N more" node`);
console.log(`relationships drawn as their own arrow somewhere: ${model.pairs.length - neverAlone.length} of ${model.pairs.length}`);
if (failures.length) {
  console.error(`\nVERIFICATION FAILED — ${failures.length} problem(s):`);
  for (const f of failures.slice(0, 40)) console.error('  ' + f);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log('verification: every view accounts for every relationship in its scope, and every node and arrow is in its drawing');

// ───────────── outputs ─────────────
if (opt('--dot-dir')) {
  const dir = opt('--dot-dir');
  mkdirSync(dir, { recursive: true });
  for (const r of rendered) if (r.view.kind !== 'focus') writeFileSync(join(dir, r.view.id.replace(/[^\w.-]/g, '_') + '.dot'), r.dot + '\n');
}

const out = opt('--out');
if (out) {
  const unitList = [...model.units.values()];
  const unitIdx = new Map(unitList.map((u, i) => [u.id, i]));
  const data = {
    title: opt('--title') || model.root || 'Java project',
    root: model.root,
    caps: CAPS,
    ink: INK,
    report: { classes: report.classes, types: report.types, packages: report.packages, relationships: report.relationships, views: report.views.total, alone: report.relationshipsDrawnAsOwnArrow },
    notes: notes.packages || {},
    packages: [...model.packages.values()].map(p => ({ full: p.full, name: p.name, parent: p.parent, children: p.children, units: p.units.map(u => unitIdx.get(u)), total: p.total })),
    units: unitList.map(u => ({
      id: u.id, name: u.name, pkg: u.pkg, kind: u.kind, abstract: u.abstract || undefined, source: u.source, line: u.line || undefined,
      ann: u.annotations.length ? u.annotations : undefined, sup: u.superExt, ifs: u.interfacesExt.length ? u.interfacesExt : undefined,
      fields: u.fields.map(f => `${f.vis[0] === 'p' && f.vis[1] === 'u' ? '+' : f.vis === 'protected' ? '#' : f.vis === 'private' ? '-' : '~'} ${f.name}: ${f.type}`),
      methods: u.methods.map(m => `${m.vis === 'public' ? '+' : m.vis === 'protected' ? '#' : m.vis === 'private' ? '-' : '~'} ${m.name}(${m.params})${m.type && m.type !== 'void' ? ': ' + m.type : ''}`),
      nested: u.nested.length ? u.nested.map(n => n.name) : undefined,
    })),
    pairs: model.pairs.map(p => ({
      f: unitIdx.get(p.from), t: unitIdx.get(p.to), rel: p.rel, kinds: kindSummary(p), label: relLabel(p) || undefined, mult: multiplicity(p) || undefined,
      ev: Object.entries({ ...p.kinds, ...Object.fromEntries(Object.entries(p.nested).map(([k, v]) => ['nested ' + k, v])) })
        .map(([k, a]) => [k, a.n, a.via.slice(0, 4), a.line || 0]),
    })),
    views: Object.fromEntries(rendered.map(r => [r.view.id, {
      kind: r.view.kind, pkg: r.view.pkg, focus: r.view.focus ? unitIdx.get(r.view.focus) : undefined,
      hidden: r.hiddenInside || undefined, stacked: r.view.stacked || undefined, folded: r.view.folded || undefined,
      nodes: r.view.nodes.map(n => ({
        id: n.id, type: n.type, inside: n.inside || undefined, pkg: n.pkg, unit: n.unit !== undefined ? unitIdx.get(n.unit) : undefined,
        text: n.type === 'unit' ? undefined : nodeText(model, n),
        parts: n.parts ? n.parts.map(p => p.type === 'unit' ? { unit: unitIdx.get(p.unit) } : { pkg: p.pkg, own: p.type === 'own' || undefined }) : undefined,
      })),
      edges: r.view.edges.map(e => ({ id: e.id, f: e.from, t: e.to, kind: e.kind, c: e.covers })),
      scope: r.view.kind === 'focus' ? undefined : r.view.pkg,
      svg: gzipSync(r.svg, { level: 9 }).toString('base64'),
    }])),
  };
  const template = readFileSync(join(here, 'template.html'), 'utf8');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const html = template.replace('__TITLE__', () => escapeHtml(data.title)).replace('"__DATA__"', () => json);
  mkdirSync(dirname(out) || '.', { recursive: true });
  writeFileSync(out, html);
  console.log(`wrote ${out} (${(html.length / 1048576).toFixed(1)} MB)`);
}

function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
