#!/usr/bin/env node
// The projector: a map document + graph.json -> the resolved document, its verification report
// and a plain-text reading. Fails closed: nothing but the report is written when a check fails.
//
//   node map.mjs --graph g.json --map doc.map.json [--out doc.resolved.json] [--report doc.verify.json]
//                [--reading doc.reading.md] [--sources src/main/java] [--docs class-docs.json] [--sets main]
//                [--accept-graph] [--write-map] [--prune-words] [--strict]
//   node map.mjs --graph g.json --seed tier1|tier2|tier3 --map-out new.map.json [--title T] [--lang pt|en]
//
// Exit 0 verified · 1 verification failed · 2 refused (schema, membership, words) · 3 graph changed
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildModel, CAPS } from '../../java-diagrams/scripts/model.mjs';
import { applyRoot, validate, resolve, levels, staleWords, stripComputed, resolvedDocument, graphHash, autoKeys, shortId, expandable, subtreeUnits } from './core.mjs';
import { seed } from './seed.mjs';
import { reading } from './reading.mjs';

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const has = n => args.includes(n);
const usage = () => { console.error(['usage: node map.mjs --graph g.json --map doc.map.json [--out r.json] [--report v.json] [--reading r.md] [--sources dir] [--docs d.json] [--sets main] [--accept-graph] [--write-map] [--prune-words] [--strict]',
  '       node map.mjs --graph g.json --seed tier1|tier2|tier3 --map-out new.map.json [--title T] [--lang pt|en]'].join('\n')); process.exit(2); };
if (!opt('--graph') || (!opt('--map') && !opt('--seed'))) usage();
const refuse = (lines) => { console.error('REFUSED:'); for (const l of [].concat(lines)) console.error('  ' + l); process.exit(2); };
const write = (path, text) => { mkdirSync(dirname(path) || '.', { recursive: true }); writeFileSync(path, text); };
const json = o => JSON.stringify(o, null, 1) + '\n';

const graph = JSON.parse(readFileSync(opt('--graph'), 'utf8'));
const model = buildModel(graph, { sets: (opt('--sets') || 'main').split(',') });
if (!model.units.size) refuse('graph.json holds no types for the chosen sets');

if (opt('--seed')) {
  const tier = Number(opt('--seed').replace('tier', ''));
  if (![1, 2, 3].includes(tier) || !opt('--map-out')) usage();
  const doc = seed(model, { tier, title: opt('--title'), lang: opt('--lang') || 'en' });
  write(opt('--map-out'), json(doc));
  console.log(`seeded a tier-${tier} document: ${doc.nodes.length} nodes, ${(doc.layers || []).length} layers -> ${opt('--map-out')}`);
  process.exit(0);
}

const mapPath = opt('--map');
const doc = JSON.parse(readFileSync(mapPath, 'utf8'));
const schema = validate(doc);
if (schema.length) refuse(schema);
const rootErr = applyRoot(doc, model);
if (rootErr) refuse(rootErr);

// the graph the words were written against
const hash = graphHash(model);
const known = doc.meta.graph;
if (known?.hash && known.hash !== hash && !has('--accept-graph')) {
  console.error(`GRAPH CHANGED: the document was written against ${known.hash} (${known.units} classes, ${known.pairs} pairs); this graph is ${hash} (${model.units.size} classes, ${model.pairs.length} pairs).`);
  const ctx0 = resolve(doc, model);
  if (!ctx0.errors.length && known.counts) {
    for (const n of ctx0.nodes.values()) {
      const now = subtreeUnits(ctx0, n.id).length, was = known.counts[n.id];
      if (was !== undefined && was !== now) console.error(`  ${n.id}: ${was} -> ${now}`);
    }
    for (const id of Object.keys(known.counts)) if (!ctx0.nodes.has(id)) console.error(`  ${id}: gone`);
  }
  console.error('Re-run with --accept-graph once the words have been checked against the new graph (and --write-map to record it).');
  process.exit(3);
}

const ctx = resolve(doc, model);
if (ctx.errors.length) refuse(ctx.errors);
const stale = staleWords(ctx);
if (stale.length && !has('--prune-words')) refuse(stale.map(s => `words on ${s.edge.from} -> ${s.edge.to} are stale: ${s.why}`));
if (stale.length) {
  const gone = new Set(stale.map(s => s.edge));
  doc.edges.derived = doc.edges.derived.filter(e => !gone.has(e));
  console.log(`pruned ${stale.length} stale word entries`);
}
const keyErrors = [];
for (const n of ctx.nodes.values()) if (n.kind === 'class' && n.unit && n.keys) { const k = autoKeys(ctx, n.unit, n.keys); if (k.error) keyErrors.push(`node ${n.id}: ${k.error}`); }
if (keyErrors.length) refuse(keyErrors);

// sources and translations are optional inputs; both are checked, neither is required
const sourcesOf = opt('--sources') ? unit => javadocOf(opt('--sources'), unit) : () => ({});
const docs = opt('--docs') ? JSON.parse(readFileSync(opt('--docs'), 'utf8')) : {};
const docWarnings = [];
if (opt('--docs')) for (const n of ctx.nodes.values()) {
  if (n.kind !== 'class' || !n.unit) continue;
  const s = sourcesOf(n.unit), short = shortId(model, n.unit), d = docs[short];
  if (!s.doc) continue;
  if (!d) docWarnings.push(`no translation for ${short}`);
  else if (d.en !== s.doc) docWarnings.push(`translation of ${short} is stale (the Javadoc changed)`);
}

const lv = levels(ctx);
const failures = Object.entries(lv).flatMap(([k, v]) => v.failures.map(f => `${k}: ${f}`));
const warnings = [...docWarnings];
const roots = [...ctx.nodes.values()].filter(n => n.parent === undefined);
if (doc.meta.tier === 1) { const v = lv.default.visible; if (v < 15 || v > 40) warnings.push(`tier 1 shows ${v} boxes by default; 15–40 is the readable range`); }
if (doc.meta.tier === 2) for (const r of roots) if (expandable(r)) { const boxes = r.children.length + (r.units.length ? 1 : 0); if (boxes > CAPS.classNodes) warnings.push(`${r.id} opens to ${boxes} boxes; above ${CAPS.classNodes} a page stops being readable`); }
const wordsMissing = [...new Set(Object.values(lv).flatMap(v => v.wordsMissing))];
if (wordsMissing.length) (doc.meta.requireWords ? failures : warnings).push(`${wordsMissing.length} drawn arrow(s) without words: ${wordsMissing.slice(0, 8).join('; ')}${wordsMissing.length > 8 ? ' …' : ''}`);
if (has('--strict')) failures.push(...warnings.splice(0));

const report = {
  ok: failures.length === 0, tier: doc.meta.tier, title: doc.meta.title,
  graph: { hash, units: model.units.size, pairs: model.pairs.length, root: model.root },
  nodes: { byKind: count([...ctx.nodes.values()].map(n => n.kind)), planned: [...ctx.nodes.values()].filter(n => n.planned).length, auto: [...ctx.nodes.values()].filter(n => n.auto).length },
  owned: model.units.size - ctx.unowned.length, unowned: ctx.unowned.length, unownedSample: ctx.unowned.slice(0, 40).map(u => shortId(model, u)),
  declared: (doc.edges?.declared || []).length,
  levels: Object.fromEntries(Object.entries(lv).map(([k, v]) => [k, { ...v, failures: v.failures.slice(0, 50), wordsMissing: v.wordsMissing.slice(0, 50) }])),
  wordsMissing, warnings, failures: failures.slice(0, 200), failureCount: failures.length,
};
if (opt('--report')) write(opt('--report'), JSON.stringify(report, null, 2));

const kinds = Object.entries(report.nodes.byKind).map(([k, v]) => `${v} ${k}`).join(', ');
console.log(`${model.units.size} classes, ${model.pairs.length} relationships (graph ${hash}); document: tier ${doc.meta.tier}, ${ctx.nodes.size} nodes (${kinds}), ${report.owned} classes owned, ${ctx.unowned.length} unowned`);
for (const [k, v] of Object.entries(lv)) console.log(`  ${k.padEnd(14)} ${String(v.visible).padStart(4)} boxes · ${String(v.pairsInScope).padStart(5)} relations in scope · ${String(v.drawn).padStart(4)} arrows drawn · ${String(v.listed).padStart(3)} listed · ${v.declared} declared${v.reduced.length ? ` · ${v.reduced.length} automatic stacks` : ''}${v.accounted ? '' : ' · NOT ACCOUNTED'}`);
for (const w of warnings) console.log('  warning: ' + w);
if (failures.length) {
  console.error(`\nVERIFICATION FAILED — ${failures.length} problem(s):`);
  for (const f of failures.slice(0, 40)) console.error('  ' + f);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log('verified: every state accounts for every relationship between the classes it shows');

if (opt('--out')) { write(opt('--out'), JSON.stringify(resolvedDocument(ctx, { docs, sourcesOf }))); console.log(`wrote ${opt('--out')}`); }
if (opt('--reading')) { write(opt('--reading'), reading(ctx, lv)); console.log(`wrote ${opt('--reading')}`); }
if (has('--write-map') || (stale.length && has('--prune-words'))) {
  const out = stripComputed(doc);
  const counts = {};
  for (const n of ctx.nodes.values()) if (!n.auto) counts[n.id] = subtreeUnits(ctx, n.id).length;
  out.meta.root = model.root;
  out.meta.graph = { hash, units: model.units.size, pairs: model.pairs.length, root: model.root, counts };
  write(mapPath, json(out));
  console.log(`updated ${mapPath} (graph ${hash})`);
}

function count(xs) { const m = {}; for (const x of xs) m[x] = (m[x] || 0) + 1; return m; }

/** The first paragraph of the class's own Javadoc, as plain text, and where the class lives. */
function javadocOf(dir, unit) {
  const rel = unit.replace(/\./g, '/') + '.java';
  const path = join(dir, rel);
  if (!existsSync(path)) return {};
  const src = readFileSync(path, 'utf8');
  const name = unit.slice(unit.lastIndexOf('.') + 1);
  const m = src.match(new RegExp('/\\*\\*((?:(?!\\*/)[\\s\\S])*?)\\*/\\s*(?:@\\w+(?:\\([^)]*\\))?\\s*)*(?:public |final |abstract |sealed |non-sealed )*(?:class|interface|record|enum) ' + name.replace(/[$]/g, '\\$') + '\\b'));
  if (!m) return { file: rel };
  let text = m[1].split('\n').map(l => l.trim().replace(/^\*/, '').trim()).join('\n');
  text = text.trim().split(/\n\s*\n|<p>|<pre>|<h\d>|\n@/)[0];
  text = text.replace(/\{@(?:code|link|linkplain)\s+([^}]*)\}/g, '$1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return { doc: text.replace(/\s+/g, ' ').trim(), file: rel };
}
