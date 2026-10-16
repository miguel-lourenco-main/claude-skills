import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graph } from './fixture/graph.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MAP = join(here, '..', 'scripts', 'map.mjs');
let dir, g;
before(() => { dir = mkdtempSync(join(tmpdir(), 'archmap-')); g = join(dir, 'graph.json'); writeFileSync(g, JSON.stringify(graph)); });
const run = (...a) => { const r = spawnSync('node', [MAP, '--graph', g, ...a], { encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
const write = (name, doc) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(doc)); return p; };
const good = () => ({ format: 'code-maps/map@1', meta: { tier: 2, title: 'fixture', lang: 'en', single: true },
  layout: {}, layers: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
  nodes: [{ id: 'core', kind: 'component', title: 'Core', layer: 'a', members: { select: [{ pkg: 'core' }] } },
    { id: 'core.Engine', kind: 'class', parent: 'core' },
    { id: 'rest', kind: 'component', title: 'Rest', layer: 'b', members: { select: [{ pkg: 'web' }] } },
    { id: 'plugins', kind: 'component', title: 'Plugins', layer: 'b', members: { select: [{ pkg: 'plugins.**' }] } },
    { id: 'db', kind: 'actor', shape: 'store', title: 'DB', layer: 'b' }],
  edges: { derived: [{ from: 'rest', to: 'core', label: 'calls the engine', desc: 'The API holds one Engine.' }], declared: [{ from: 'core', to: 'db' }], rules: [{ rule: 'implied' }] } });

test('seeds for the three tiers are valid documents', () => {
  for (const t of [1, 2, 3]) {
    const out = join(dir, `seed${t}.map.json`);
    const r = run('--seed', `tier${t}`, '--map-out', out, '--title', 'seed');
    assert.equal(r.code, 0, r.out);
    const d = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(d.meta.tier, t);
    const v = run('--map', out);
    assert.equal(v.code, 0, v.out);
  }
  const s1 = JSON.parse(readFileSync(join(dir, 'seed1.map.json'), 'utf8'));
  assert.ok(s1.nodes.some(n => n.id === 'plugins') && s1.hints.perPackage.plugins.classes === 8);
  const s2 = JSON.parse(readFileSync(join(dir, 'seed2.map.json'), 'utf8'));
  assert.ok(s2.hints.families.some(f => f.id === 'core.Plugin' && f.n === 7));
  const s3 = JSON.parse(readFileSync(join(dir, 'seed3.map.json'), 'utf8'));
  assert.equal(s3.meta.auto, 'packages');
});

test('a good document verifies, writes out/report/reading, and --write-map records the graph', () => {
  const p = write('good.map.json', good());
  const r = run('--map', p, '--out', join(dir, 'good.resolved.json'), '--report', join(dir, 'good.verify.json'), '--reading', join(dir, 'good.md'), '--write-map');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /verified: every state/);
  const rep = JSON.parse(readFileSync(join(dir, 'good.verify.json'), 'utf8'));
  assert.equal(rep.ok, true); assert.equal(rep.unowned, 2); assert.equal(rep.declared, 1);
  const res = JSON.parse(readFileSync(join(dir, 'good.resolved.json'), 'utf8'));
  assert.equal(res.resolved.nodes['core.Engine'].facts.name, 'Engine');
  assert.ok(res.meta.graph.hash);
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(doc.meta.graph.hash, res.meta.graph.hash);
  assert.equal(doc.meta.graph.counts.plugins, 8);
  assert.match(readFileSync(join(dir, 'good.md'), 'utf8'), /## Top level/);
  // the recorded graph still matches: exit 0 again
  assert.equal(run('--map', p).code, 0);
});

test('a changed graph exits 3 until accepted', () => {
  const p = write('stale.map.json', { ...good(), meta: { ...good().meta, graph: { hash: 'deadbeef', units: 1, pairs: 1, counts: { plugins: 2 } } } });
  const r = run('--map', p);
  assert.equal(r.code, 3); assert.match(r.out, /GRAPH CHANGED/); assert.match(r.out, /plugins: 2 -> 8/);
  assert.equal(run('--map', p, '--accept-graph').code, 0);
});

test('refusals exit 2 and write nothing', () => {
  const cases = [
    [{ ...good(), edges: { ...good().edges, declared: [{ from: 'core', to: 'rest' }] } }, /needs an actor/],
    [{ ...good(), edges: { ...good().edges, derived: [{ from: 'rest', to: 'core', n: 2 }] } }, /computed, not written/],
    [{ ...good(), nodes: [...good().nodes, { id: 'core.Nope', kind: 'class', parent: 'core' }] }, /not a class/],
    [{ ...good(), nodes: [...good().nodes, { id: 'core.Engine2', kind: 'class', unit: 'core.Engine', parent: 'rest' }] }, /claimed by both/],
    [{ ...good(), edges: { ...good().edges, derived: [{ from: 'rest', to: 'core', hide: '' }] } }, /hide needs a reason/],
    [{ ...good(), nodes: good().nodes.map(n => n.id === 'core.Engine' ? { ...n, keys: { methods: ['zap'] } } : n) }, /does not have: zap/],
    [{ ...good(), edges: { ...good().edges, derived: [{ from: 'rest', to: 'plugins', label: 'nothing' }] } }, /stale/],
  ];
  for (const [d, re] of cases) {
    const p = write('bad.map.json', d);
    const out = join(dir, 'bad.resolved.json');
    const r = run('--map', p, '--out', out);
    assert.equal(r.code, 2, r.out); assert.match(r.out, re);
    assert.ok(!existsSync(out));
  }
});

test('--prune-words removes stale words and rewrites the document', () => {
  const p = write('prune.map.json', { ...good(), edges: { ...good().edges, derived: [...good().edges.derived, { from: 'rest', to: 'plugins', label: 'nothing' }] } });
  const r = run('--map', p, '--prune-words');
  assert.equal(r.code, 0, r.out); assert.match(r.out, /pruned 1/);
  assert.equal(JSON.parse(readFileSync(p, 'utf8')).edges.derived.length, 1);
});

test('requireWords turns missing words into a verification failure (exit 1, report only)', () => {
  const d = good(); d.meta.requireWords = true; d.edges.derived = [];
  const p = write('words.map.json', d);
  const out = join(dir, 'words.resolved.json'), rep = join(dir, 'words.verify.json');
  const r = run('--map', p, '--out', out, '--report', rep);
  assert.equal(r.code, 1, r.out); assert.match(r.out, /without words/);
  assert.ok(!existsSync(out)); assert.ok(existsSync(rep));
  assert.equal(JSON.parse(readFileSync(rep, 'utf8')).ok, false);
});
