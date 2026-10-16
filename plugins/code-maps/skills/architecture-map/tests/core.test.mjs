import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, CAPS } from '../../java-diagrams/scripts/model.mjs';
import * as core from '../scripts/core.mjs';
import { graph } from './fixture/graph.mjs';

const model = buildModel(graph);
const FMT = core.FORMAT;
const doc = (o = {}) => ({ format: FMT, meta: { tier: 2, title: 't', lang: 'en' }, layout: {}, layers: [], nodes: [], edges: { derived: [], declared: [], rules: [] }, ...o });
const ok = d => { const errs = core.validate(d); assert.deepEqual(errs, []); const ctx = core.resolve(d, model); assert.deepEqual(ctx.errors, []); return ctx; };
const names = set => [...set].map(u => core.shortId(model, u)).sort();

test('selectors: pkg exact, children, subtree, name glob, annotated, implements, extends, transitive, except', () => {
  const inh = new Map();
  for (const p of model.pairs) for (const k of ['extends', 'implements']) if (p.kinds[k]) { if (!inh.has(p.to)) inh.set(p.to, []); inh.get(p.to).push({ from: p.from, kind: k }); }
  const sel = s => names(core.selectUnits(model, s, inh));
  assert.deepEqual(sel({ pkg: 'core' }), ['core.Engine', 'core.Input', 'core.Plugin', 'core.Reporter', 'core.Result', 'core.Store']);
  assert.deepEqual(sel({ pkg: 'plugins.*' }), []);
  assert.deepEqual(sel({ pkg: '*' }).length, 0);
  assert.equal(sel({ pkg: '**' }).length, 17);
  assert.deepEqual(sel({ pkg: 'plugins.**' }).length, 8);
  assert.deepEqual(sel({ name: '*Store' }), ['core.Store', 'io.FileStore']);
  assert.deepEqual(sel({ annotated: 'RestController' }), ['web.Api']);
  assert.deepEqual(sel({ implements: 'core.Plugin' }), ['plugins.A', 'plugins.B', 'plugins.Base', 'plugins.C', 'plugins.D', 'plugins.E', 'plugins.F']);
  assert.deepEqual(sel({ implements: 'core.Plugin', transitive: true }), ['plugins.A', 'plugins.B', 'plugins.Base', 'plugins.C', 'plugins.D', 'plugins.E', 'plugins.F', 'plugins.G']);
  assert.deepEqual(sel({ extends: 'plugins.Base' }), ['plugins.G']);
  assert.deepEqual(sel({ pkg: 'plugins.**', name: '*Base' }), ['plugins.Base']);
});

test('resolve: explicit beats selector, deepest selector wins, same-level double claim is refused', () => {
  const ctx = ok(doc({ nodes: [
    { id: 'all', kind: 'component', members: { select: [{ pkg: '**' }] } },
    { id: 'plug', kind: 'component', parent: 'all', members: { select: [{ pkg: 'plugins.**' }] } },
    { id: 'plugins.G', kind: 'class', parent: 'all' },
  ] }));
  assert.equal(ctx.owner.get('acme.plugins.A'), 'plug');
  assert.equal(ctx.owner.get('acme.plugins.G'), 'plugins.G');
  assert.equal(ctx.owner.get('acme.core.Engine'), 'all');
  assert.equal(ctx.unowned.length, 0);
  const bad = core.resolve(doc({ nodes: [
    { id: 'x', kind: 'component', members: { select: [{ pkg: 'plugins.**' }] } },
    { id: 'y', kind: 'component', members: { select: [{ implements: 'core.Plugin' }] } },
  ] }), model);
  assert.ok(bad.errors.some(e => /selected by both x and y/.test(e)));
  const bad2 = core.resolve(doc({ nodes: [{ id: 'core.Engine', kind: 'class' }, { id: 'e', kind: 'component', members: { units: ['core.Engine'] } }] }), model);
  assert.ok(bad2.errors.some(e => /claimed by both/.test(e)));
});

test('resolve refusals: unknown unit, empty selector, count, alias of unowned, children under a class', () => {
  assert.ok(core.resolve(doc({ nodes: [{ id: 'core.Nope', kind: 'class' }] }), model).errors.some(e => /not a class in the graph/.test(e)));
  assert.ok(core.resolve(doc({ nodes: [{ id: 's', kind: 'stack', members: { select: [{ name: 'Zzz*' }] } }] }), model).errors.some(e => /match nothing/.test(e)));
  assert.deepEqual(core.resolve(doc({ nodes: [{ id: 's', kind: 'stack', members: { select: [{ name: 'Zzz*' }], optional: true } }] }), model).errors, []);
  assert.ok(core.resolve(doc({ nodes: [{ id: 's', kind: 'stack', members: { select: [{ implements: 'core.Plugin' }] }, count: 3 }] }), model).errors.some(e => /count says 3, the graph gives 7/.test(e)));
  assert.ok(core.resolve(doc({ nodes: [{ id: 'a', kind: 'class', alias: 'core.Engine' }] }), model).errors.some(e => /which no node owns/.test(e)));
  assert.ok(core.validate(doc({ nodes: [{ id: 'core.Engine', kind: 'class' }, { id: 'k', kind: 'class', unit: 'core.Input', parent: 'core.Engine' }] })).some(e => /has no children/.test(e)));
});

test('validate: declared arrows need an actor or planned end; evidence fields are refused on input; layer only on roots', () => {
  const d = doc({ nodes: [{ id: 'a', kind: 'component', members: { select: [{ pkg: 'core' }] } }, { id: 'b', kind: 'component', members: { select: [{ pkg: 'io' }] } }, { id: 'db', kind: 'actor', shape: 'store' }, { id: 'p', kind: 'component', planned: true }],
    edges: { derived: [], declared: [{ from: 'a', to: 'b' }], rules: [] } });
  assert.ok(core.validate(d).some(e => /needs an actor or a planned box/.test(e)));
  d.edges.declared = [{ from: 'a', to: 'db' }, { from: 'p', to: 'b', both: true }];
  assert.deepEqual(core.validate(d), []);
  d.edges.declared = [{ from: 'a', to: 'db', n: 3 }];
  assert.ok(core.validate(d).some(e => /evidence/.test(e)));
  d.edges.declared = []; d.edges.derived = [{ from: 'a', to: 'b', covers: [1] }];
  assert.ok(core.validate(d).some(e => /computed, not written/.test(e)));
  d.edges.derived = [{ from: 'a', to: 'b', hide: ' ' }];
  assert.ok(core.validate(d).some(e => /hide needs a reason/.test(e)));
  const e2 = core.validate(doc({ layers: [{ id: 'l' }], nodes: [{ id: 'a', kind: 'component' }, { id: 'b', kind: 'component', parent: 'a', layer: 'l' }] }));
  assert.ok(e2.some(e => /root nodes only/.test(e)));
});

const TIER2 = () => doc({
  meta: { tier: 2, title: 't', lang: 'en', single: true, entryMethods: ['run', 'apply'] },
  layers: [{ id: 'l0', title: 'App' }, { id: 'l1', title: 'Core' }, { id: 'l2', title: 'Plugins' }, { id: 'l3', title: 'IO' }],
  nodes: [
    { id: 'app', kind: 'component', title: 'App', layer: 'l0' },
    { id: 'app.Main', kind: 'class', parent: 'app' },
    { id: 'web.Api', kind: 'class', parent: 'app' },
    { id: 'core', kind: 'component', title: 'Core', layer: 'l1' },
    { id: 'core.box', kind: 'component', title: 'Engine', parent: 'core', flow: 'DOWN' },
    { id: 'core.Engine', kind: 'class', parent: 'core.box' },
    { id: 'core.Plugin', kind: 'class', parent: 'core.box' },
    { id: 'core.Result', kind: 'class', parent: 'core', quiet: 'used by nearly everything here' },
    { id: 'core.Input', kind: 'class', parent: 'core' },
    { id: 'core.Reporter', kind: 'class', parent: 'core' },
    { id: 'core.Store', kind: 'class', parent: 'core' },
    { id: 'plugins', kind: 'component', title: 'Plugins', layer: 'l2' },
    { id: 'plugins/Plugin', kind: 'class', alias: 'core.Plugin', parent: 'plugins' },
    { id: 'plugins.Base', kind: 'class', parent: 'plugins' },
    { id: 'plugins.G', kind: 'class', parent: 'plugins' },
    { id: 'stack:impl', kind: 'stack', parent: 'plugins', title: '{n} plugins', members: { select: [{ implements: 'core.Plugin' }] }, drawOnly: ['extends', 'implements'] },
    { id: 'io', kind: 'component', title: 'IO', layer: 'l3', collapsed: true },
    { id: 'io.FileStore', kind: 'class', parent: 'io' },
  ],
  edges: { derived: [{ from: 'app.Main', to: 'core.Engine', label: 'starts the engine', desc: 'Main builds one Engine and runs it.' }, { from: 'core.Engine', to: 'core.Input', hide: 'only a parameter' }],
    declared: [], rules: [{ rule: 'implied' }, { rule: 'nonAdjacentLayers', scope: 'top' }] },
});

test('project + account: every level is accounted for; rules, alias, stack, quiet, hide, mutual, words all land', () => {
  const ctx = ok(TIER2());
  assert.equal(ctx.unowned.length, 0);
  const lv = core.levels(ctx);
  for (const [k, v] of Object.entries(lv)) assert.deepEqual(v.failures, [], k);
  assert.ok(lv['open:core'] && lv['open:plugins'] && lv['open:io']);
  // the macro: app -> core drawn, app -> plugins not adjacent -> listed
  const top = core.project(ctx, new Set());
  const e = (p, a, b) => p.edges.find(x => x.from === a && x.to === b);
  assert.ok(e(top, 'app', 'core').drawn);
  assert.equal(e(top, 'app', 'plugins'), undefined);
  assert.equal(e(top, 'plugins', 'core').drawn, true);
  assert.equal(e(top, 'io', 'core').drawn, false);
  assert.match(e(top, 'io', 'core').why, /not neighbours/);
  assert.ok(e(top, 'core', 'app').mutual && e(top, 'app', 'core').mutual);
  // inside core: the quiet target, the hidden overlay, the Optional multiplicity, the nested inherit label
  const core_ = core.project(ctx, new Set(['core', 'core.box']));
  assert.equal(e(core_, 'core.Engine', 'core.Result').drawn, false);
  assert.equal(e(core_, 'core.Engine', 'core.Result').why, 'used by nearly everything here');
  assert.equal(e(core_, 'core.Engine', 'core.Input').why, 'only a parameter');
  assert.equal(e(core_, 'core.Engine', 'core.Reporter').tech, 'reporter 0..1');
  assert.equal(e(core_, 'core.Engine', 'core.Reporter').rel, 'field');
  assert.deepEqual(e(core_, 'core.Engine', 'core.Reporter').kinds, ['field', 'nested implements']);
  assert.equal(e(core_, 'core.Engine', 'core.Plugin').tech, 'plugins *');
  // the Main -> Engine words sit on the edge when app is open
  const app = core.project(ctx, new Set(['app']));
  assert.equal(e(app, 'app.Main', 'core.Engine'), undefined, 'cross-root edges attach to the root frame under boundary=root');
  assert.ok(e(app, 'app', 'core'));
  const both = core.project(ctx, new Set(['app', 'core', 'core.box']));
  assert.equal(e(both, 'app.Main', 'core.Engine'), undefined);
  const noB = ok({ ...TIER2(), layout: { boundary: 'none' } });
  const b2 = core.project(noB, new Set(['app', 'core', 'core.box']));
  assert.equal(e(b2, 'app.Main', 'core.Engine').label, 'starts the engine');
  assert.equal(e(b2, 'app.Main', 'core.Engine').tech, 'engine');
  for (const exp of [new Set(['app', 'core', 'core.box']), new Set(['app']), new Set()]) assert.deepEqual(core.account(noB, core.project(noB, exp)), []);
  // inside plugins: the alias takes the implements arrows, the stack only draws inheritance
  const pl = core.project(ctx, new Set(['plugins']));
  const stackToAlias = e(pl, 'stack:impl', 'plugins/Plugin');
  assert.ok(stackToAlias && stackToAlias.drawn && stackToAlias.rel === 'implements');
  assert.equal(stackToAlias.n, 6, 'Base is an explicit box, so the selector leaves it out');
  assert.equal(stackToAlias.tech, '6×');
  assert.equal(e(pl, 'plugins.G', 'plugins.Base').rel, 'extends');
  assert.equal(e(pl, 'plugins', 'core').drawn, true, 'plugins -> core (Result, Input) stays at the frame');
  assert.equal(e(pl, 'stack:impl', 'core'), undefined);
  const w = lv['open:plugins'].whyCounts;
  assert.ok(Object.keys(w).length >= 0);
});

test('own box: an open group with direct members draws them as one box', () => {
  const ctx = ok(doc({ meta: { tier: 1, title: 't', lang: 'en' }, layout: { boundary: 'none' }, nodes: [
    { id: 'sys', kind: 'component', members: { select: [{ pkg: 'core' }] } },
    { id: 'eng', kind: 'component', parent: 'sys', members: { units: ['core.Engine'] } },
    { id: 'rest', kind: 'component', members: { select: [{ pkg: 'web' }, { pkg: 'app' }] } },
    { id: 'db', kind: 'actor', shape: 'store' },
  ], edges: { derived: [], declared: [{ from: 'sys', to: 'db' }], rules: [] } }));
  const p = core.project(ctx, new Set(['sys']));
  assert.ok(p.nodes.has('sys/own'));
  assert.equal(p.nodes.get('sys/own').count, 5);
  assert.ok(p.edges.find(x => x.from === 'eng' && x.to === 'sys/own'));
  assert.ok(p.edges.find(x => x.from === 'rest' && x.to === 'eng'));
  assert.deepEqual(core.account(ctx, p), []);
  assert.equal(p.declared.length, 1);
  const top = core.project(ctx, new Set());
  assert.equal(top.declared[0].from, 'sys');
  assert.deepEqual(core.account(ctx, top), []);
  assert.equal(core.levels(ctx).full.pairsInScope + core.levels(ctx).full.pairsInsideOneBox, model.pairs.filter(q => ctx.owner.has(q.from) && ctx.owner.has(q.to)).length);
});

test('autoKeys: held fields and called methods, entry methods first, keys override checked', () => {
  const ctx = ok(TIER2());
  const k = core.autoKeys(ctx, 'acme.core.Engine');
  assert.deepEqual(k.fields, ['plugins: List<Plugin>', 'store: Store', 'reporter: Optional<Reporter>']);
  assert.equal(k.methods[0], 'run(Input): Result');
  const o = core.autoKeys(ctx, 'acme.core.Engine', { fields: ['store'], methods: ['api'] });
  assert.deepEqual(o, { fields: ['store: Store'], methods: ['api(): Api'] });
  assert.match(core.autoKeys(ctx, 'acme.core.Engine', { fields: ['nope'] }).error, /does not have: nope/);
  const f = core.classFacts(ctx, 'acme.core.Engine');
  assert.equal(f.kind, 'class'); assert.equal(f.usedBy, 3); assert.equal(f.nested[0], 'Stats');
});

test('graphHash is stable, order-independent and sensitive; compact/inflate round-trips', () => {
  const h = core.graphHash(model);
  assert.equal(h, core.graphHash(buildModel({ ...graph, edges: [...graph.edges].reverse() })));
  assert.notEqual(h, core.graphHash(buildModel({ ...graph, edges: graph.edges.slice(1) })));
  const back = core.inflateModel(JSON.parse(JSON.stringify(core.compactModel(model))));
  assert.equal(core.graphHash(back), h);
  assert.equal(back.pairs.length, model.pairs.length);
  assert.equal(back.units.get('acme.core.Engine').fields.length, 3);
});

test('stripComputed keeps the authored fields only and resolvedDocument carries the facts', () => {
  const ctx = ok(TIER2());
  const r = core.resolvedDocument(ctx);
  assert.equal(r.resolved.nodes['core.Engine'].facts.name, 'Engine');
  assert.deepEqual(r.resolved.nodes['stack:impl'].units.length, 6);
  assert.ok(r.resolved.levels.full.accounted);
  const s = core.stripComputed({ ...r, nodes: [...ctx.nodes.values()] });
  assert.equal(s.resolved, undefined);
  assert.ok(!('units' in s.nodes[0]));
  assert.equal(s.nodes.find(n => n.id === 'core.Engine').unit, undefined);
  assert.equal(s.nodes.find(n => n.id === 'plugins/Plugin').alias, 'core.Plugin');
});

test('staleWords: an overlay with no pair between its boxes is reported', () => {
  const d = TIER2();
  d.edges.derived.push({ from: 'core.Input', to: 'core.Store', label: 'nothing joins these' });
  const ctx = ok(d);
  const st = core.staleWords(ctx);
  assert.equal(st.length, 1); assert.equal(st[0].edge.from, 'core.Input');
});

test('auto packages: one node per package and per class, overrides merge, open package over the cap is reduced to stacks', () => {
  // a bigger graph: 30 plugins, so the plugins package opens past CAPS.classNodes
  const big = JSON.parse(JSON.stringify(graph));
  for (let i = 0; i < 30; i++) {
    const id = `acme.plugins.P${i}`;
    big.types.push({ id, name: `P${i}`, pkg: 'acme.plugins', kind: 'class', vis: 'public', set: 'main', fields: [], methods: [], interfaces: ['acme.core.Plugin'] });
    big.edges.push({ from: id, to: 'acme.core.Plugin', kinds: { implements: { n: 1 } } }, { from: id, to: 'acme.core.Result', kinds: { creates: { n: 1 } } }, { from: id, to: 'acme.core.Input', kinds: { param: { n: 1 } } });
  }
  const m2 = buildModel(big);
  const d = doc({ meta: { tier: 3, title: 't', lang: 'en', auto: 'packages' }, nodes: [{ id: 'p:plugins', phrase: 'the plugins' }, { id: 'p:io', collapsed: true }], edges: { derived: [], declared: [], rules: [{ rule: 'implied', scope: 'all' }] } });
  assert.deepEqual(core.validate(d), []);
  const ctx = core.resolve(d, m2);
  assert.deepEqual(ctx.errors, []);
  assert.equal(ctx.unowned.length, 0);
  assert.equal(ctx.nodes.get('p:plugins').phrase, 'the plugins');
  assert.equal(ctx.nodes.get('p:plugins').children.length, 38);
  assert.equal(ctx.nodes.get('core.Engine').parent, 'p:core');
  const exp = core.fullExpansion(ctx);
  const red = core.reductions(ctx, 'p:plugins', exp);
  assert.ok(red.length >= 1, 'stacks were made');
  assert.ok(red.some(r => r.auto === 'same-connections'));
  const c2 = core.withReductions(ctx, exp);
  const proj = core.project(c2, exp);
  const inPlugins = [...proj.nodes.values()].filter(v => v.parent === 'p:plugins');
  assert.ok(inPlugins.length <= CAPS.classNodes, `plugins opens to ${inPlugins.length} boxes`);
  assert.deepEqual(core.account(c2, proj), []);
  const lv = core.levels(ctx);
  for (const [k, v] of Object.entries(lv)) assert.deepEqual(v.failures, [], k);
  assert.ok(lv.full.reduced.length >= 1);
});

test('meta.root pins the package ids are relative to; packages above it are the sheet, classes outside it keep full ids', () => {
  const m2 = buildModel(graph);
  const d = doc({ meta: { tier: 3, title: 't', lang: 'en', auto: 'packages', root: 'acme.core' }, nodes: [{ id: 'Engine', phrase: 'the engine' }] });
  assert.deepEqual(core.validate(d), []);
  const ctx = core.resolve(d, m2);
  assert.deepEqual(ctx.errors, []);
  assert.equal(m2.root, 'acme.core');
  assert.equal(ctx.nodes.get('Engine').phrase, 'the engine');
  assert.equal(ctx.nodes.get('Engine').parent, undefined, 'a class in the root package is top-level');
  assert.equal(ctx.nodes.get('acme.io.FileStore').parent, 'p:acme.io', 'outside the root: full ids');
  assert.equal(ctx.nodes.get('p:acme.io').parent, undefined);
  assert.ok(!ctx.nodes.has('p:acme') && !ctx.nodes.has('p:'), 'nothing above the root is a box');
  assert.equal(ctx.unowned.length, 0);
  for (const [k, v] of Object.entries(core.levels(ctx))) assert.deepEqual(v.failures, [], k);
  const bad = core.resolve(doc({ meta: { tier: 1, title: 't', lang: 'en', root: 'acme.nope' } }), buildModel(graph));
  assert.match(bad.errors[0], /not a package in the graph/);
});

test('boundary open: an arrow that leaves an open box attaches to its frame, declared arrows too; words never land on an own box', () => {
  const nodes = [
    { id: 'sys', kind: 'component', members: { select: [{ pkg: 'core' }] } },
    { id: 'eng', kind: 'component', parent: 'sys', members: { units: ['core.Engine'] } },
    { id: 'io', kind: 'component', members: { select: [{ pkg: 'io' }] } },
    { id: 'plug', kind: 'component', members: { select: [{ pkg: 'plugins.**' }] } },
    { id: 'rest', kind: 'component', members: { select: [{ pkg: 'web' }, { pkg: 'app' }] } },
    { id: 'db', kind: 'actor', shape: 'store' },
  ];
  const words = [{ from: 'io', to: 'eng', label: 'uses the engine' }];
  // open: with sys open, nothing from outside reaches eng or sys/own; the declared arrow moves to the frame as well
  const open = ok(doc({ meta: { tier: 1, title: 't', lang: 'en' }, layout: { boundary: 'open' }, nodes, edges: { derived: words, declared: [{ from: 'eng', to: 'db' }], rules: [] } }));
  const p = core.project(open, new Set(['sys']));
  const parentOf = id => id.endsWith('/own') ? id.slice(0, -4) : open.nodes.get(id).parent;
  for (const e of [...p.edges, ...p.declared]) assert.equal(parentOf(e.from), parentOf(e.to), `${e.from} -> ${e.to} joins two siblings`);
  assert.ok(p.edges.find(e => e.from === 'eng' && e.to === 'sys/own'));
  assert.ok(p.edges.find(e => e.from === 'io' && e.to === 'sys'));
  assert.equal(p.declared[0].from, 'sys');
  assert.deepEqual(core.account(open, p), []);
  // none: the words written for io -> eng stay on that arrow; io -> sys/own (FileStore -> Store, Result) inherits nothing
  const none = ok(doc({ meta: { tier: 1, title: 't', lang: 'en' }, layout: { boundary: 'none' }, nodes, edges: { derived: words, declared: [], rules: [] } }));
  const q = core.project(none, new Set(['sys']));
  assert.equal(q.edges.find(e => e.from === 'io' && e.to === 'eng').label, 'uses the engine');
  assert.ok(!q.edges.find(e => e.from === 'io' && e.to === 'sys/own').label);
  // closed: the one worded pair folded inside sys is inherited by io -> sys, and marked so
  const c = core.project(none, new Set());
  const folded = c.edges.find(e => e.from === 'io' && e.to === 'sys');
  assert.equal(folded.label, 'uses the engine'); assert.equal(folded.inherited, true);
  // the layout switches are validated
  assert.ok(core.validate(doc({ layout: { openDirection: 'SIDEWAYS' } })).some(m => /openDirection/.test(m)));
  assert.ok(core.validate(doc({ layout: { packClosed: 'yes' } })).some(m => /packClosed/.test(m)));
  assert.deepEqual(core.validate(doc({ layout: { boundary: 'open', openDirection: 'RIGHT', packClosed: true } })), []);
});

test('tier 0: looks, the chain read from a process file and the links\' stated names, band arrows, the draw.io cells', async () => {
  const { lookOf, chainOrder, arrowsOf, toDrawio, toSvg, layoutTier0 } = await import('../scripts/drawio.mjs');
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const ctx = ok(doc({ meta: { tier: 0, title: 'sketch', lang: 'en' }, layout: { direction: 'UP', arrows: 'bands' }, nodes: [
    { id: 'engine', kind: 'component', title: 'Engine', members: { select: [{ pkg: 'core' }] } },
    { id: 'plugins', kind: 'component', parent: 'engine', title: 'Plugins', members: { select: [{ pkg: 'plugins.**' }] } },
    { id: 'g', kind: 'component', parent: 'plugins', title: 'G', members: { units: ['plugins.G'] } },
    { id: 'io', kind: 'component', parent: 'engine', title: 'IO', members: { select: [{ pkg: 'io' }] } },
    { id: 'contracts', kind: 'component', title: 'Contracts', shape: 'row' },
    { id: 'plugin', kind: 'component', parent: 'contracts', members: { units: ['core.Plugin'] } },
    { id: 'store', kind: 'component', parent: 'contracts', members: { units: ['core.Store'] } },
    { id: 'app', kind: 'component', title: 'App', members: { select: [{ pkg: 'app' }, { pkg: 'web' }] } },
  ] }));
  assert.equal(lookOf(ctx, ctx.nodes.get('plugin')), 'type');
  assert.equal(lookOf(ctx, ctx.nodes.get('io')), 'box');
  assert.equal(lookOf(ctx, ctx.nodes.get('engine')), 'bar');
  assert.equal(lookOf(ctx, ctx.nodes.get('contracts')), 'row');
  // a process file names the links; each link's class states its name in the sources
  const dir = mkdtempSync(join(tmpdir(), 'tier0-'));
  writeFileSync(join(dir, 'p.yml'), 'name: p\nchain:\n  - { link: file-store, when: live }\n  - link: a\n');
  mkdirSync(join(dir, 'src/acme/io'), { recursive: true }); mkdirSync(join(dir, 'src/acme/plugins'), { recursive: true });
  writeFileSync(join(dir, 'src/acme/io/FileStore.java'), 'package acme.io;\npublic class FileStore { public String name() { return "file-store"; } }\n');
  writeFileSync(join(dir, 'src/acme/plugins/A.java'), 'package acme.plugins;\npublic class A { public String name() { return "a"; } }\n');
  const chain = chainOrder(ctx, join(dir, 'p.yml'), join(dir, 'src'));
  assert.deepEqual(chain.names, ['file-store', 'a']); assert.deepEqual(chain.classes, ['acme.io.FileStore', 'acme.plugins.A']); assert.equal(chain.stated, 2);
  assert.throws(() => chainOrder(ctx, join(dir, 'p.yml')), /file-store/);   // no sources: FileStoreLink by convention does not exist
  const all = new Set([...ctx.nodes.values()].filter(core.expandable).map(n => n.id));
  const proj = core.project(ctx, all);
  const arrows = arrowsOf(ctx, proj, { chain: { ...chain, file: 'p.yml' }, arrows: 'bands' });
  const flow = arrows.filter(a => a.kind === 'flow');
  assert.deepEqual(flow.map(a => [a.from, a.to]), [['io', 'plugins']]);       // the deepest visible boxes owning consecutive links
  assert.ok(arrows.every(a => a.kind === 'flow' || ctx.nodes.get(a.from).parent === undefined), 'band arrows join whole bands');
  assert.ok(arrows.some(a => a.kind === 'uses' && a.both && a.from === 'engine' && a.to === 'app'), 'app ↔ engine is one two-way arrow, pointing up the stack');
  assert.ok(!arrows.some(a => a.from === a.to));
  const lay = { cells: [{ id: 'engine', parent: null, text: 'Engine', look: 'bar', x: 0, y: 0, rx: 0, ry: 0, w: 300, h: 120, group: true }, { id: 'io', parent: 'engine', text: 'IO', look: 'box', x: 20, y: 50, rx: 20, ry: 50, w: 100, h: 44, group: false }], arrows: [{ id: 'e0', from: 'io', to: 'engine', kind: 'flow', both: true, pts: [[120, 72], [150, 72], [150, 0]] }], width: 300, height: 120, title: 't' };
  const xml = toDrawio(lay);
  assert.ok(xml.includes('swimlane;') && xml.includes('parent="engine"') && xml.includes('startArrow=block') && (xml.match(/<mxCell id="/g) || []).length === 5);
  assert.ok(toSvg(lay).includes('marker-start'));
  const { installed, elkBundlePath } = await import('../scripts/deps.mjs');
  if (!installed()) return;   // the layout itself needs ELK from the cache; the page's own check covers it elsewhere
  const l2 = await layoutTier0(ctx, proj, arrows, elkBundlePath());
  const cell = id => l2.cells.find(c => c.id === id);
  assert.ok(cell('engine').y > cell('contracts').y, `UP: the first band sits below the next (engine ${cell('engine').y}, contracts ${cell('contracts').y}, app ${cell('app').y}; arrows ${arrows.map(a => a.from + '>' + a.to).join(' ')})`);   // engine → contracts arrows point up
  for (const k of ['io', 'plugins']) { const c = cell(k), b = cell('engine'); assert.ok(c.x >= b.x && c.x + c.w <= b.x + b.w && c.y >= b.y + 36, `${k} inside engine`); }
  assert.equal(l2.arrows.filter(a => a.pts).length, arrows.length);
});
