// Starting documents. A seed is never a finished map: tier 3 is complete by construction
// (packages), tiers 1 and 2 are empty frames plus `hints` for the person or agent who writes them.
import { CAPS, INHERIT } from '../../java-diagrams/scripts/model.mjs';
import { FORMAT, shortId } from './core.mjs';

const DEFAULT_LAYERS = [['external', 'External'], ['integration', 'Integration layer'], ['processes', 'Processes layer'], ['persistence', 'Persistence layer'], ['rest', 'REST layer']];
const ENTRY_ANNOTATIONS = ['RestController', 'Controller', 'SpringBootApplication', 'Component', 'Service'];
const EXTERNAL_TYPES = /\b(HttpClient|RestClient|WebClient|RestTemplate|DataSource|EntityManager|JdbcTemplate|Connection|WebSocket|HttpRequest)\b/;

export function seed(model, { tier, title, lang = 'en' }) {
  const base = { format: FORMAT, meta: { tier, title: title || model.root || 'project', lang, root: model.root } };
  const degree = new Map();
  const implementers = new Map();
  for (const p of model.pairs) {
    degree.set(p.from, (degree.get(p.from) || 0) + 1); degree.set(p.to, (degree.get(p.to) || 0) + 1);
    if (INHERIT.includes(p.rel)) { if (!implementers.has(p.to)) implementers.set(p.to, []); implementers.get(p.to).push(p.from); }
  }
  const S = u => shortId(model, u);
  if (tier === 3) {
    const nodes = [];
    for (const p of model.packages.values()) {
      if (p.full === model.root) continue;
      // every package starts closed: the first view is the package overview, a reader opens what they need
      nodes.push({ id: 'p:' + S(p.full), collapsed: true });
    }
    return { ...base, meta: { ...base.meta, auto: 'packages' }, layout: { direction: 'DOWN' }, layers: [], nodes,
      edges: { derived: [], declared: [], rules: [{ rule: 'implied', scope: 'all' }] } };
  }
  const families = [...implementers].filter(([, xs]) => xs.length >= 5).sort((a, b) => b[1].length - a[1].length)
    .map(([u, xs]) => ({ id: S(u), kind: model.units.get(u).kind, n: xs.length, selector: { [model.units.get(u).kind === 'interface' ? 'implements' : 'extends']: S(u) } }));
  const entries = [...model.units.values()].filter(u => u.methods.some(m => m.name === 'main' && m.static) || u.annotations.some(a => ENTRY_ANNOTATIONS.includes(a))
    || u.interfacesExt.some(i => /CommandLineRunner|ApplicationRunner/.test(i))).map(u => ({ id: S(u.id), why: u.methods.some(m => m.name === 'main' && m.static) ? 'main' : u.annotations.find(a => ENTRY_ANNOTATIONS.includes(a)) || 'runner' }));
  if (tier === 2) {
    const mostConnected = [...degree].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 80).map(([u, d]) => ({ id: S(u), kind: model.units.get(u).kind, relations: d }));
    return { ...base, meta: { ...base.meta, single: true, requireWords: true, entryMethods: [] }, layout: { direction: 'RIGHT' }, layers: [], nodes: [],
      edges: { derived: [], declared: [], rules: [{ rule: 'implied' }, { rule: 'nonAdjacentLayers', scope: 'top' }] },
      hints: { mostConnected, families, entries, note: 'Pick ~65 classes in ~7 components following the flow of a run; stacks come from `families`; every drawn arrow gets a label and a desc. Delete `hints` when done.' } };
  }
  // tier 1: one component per package under the root, all unassigned, with what the code says about each
  const rootPkg = model.packages.get(model.root);
  const nodes = [], perPackage = {};
  for (const child of rootPkg.children) {
    const id = S(child).replace(/\./g, '-');
    nodes.push({ id, kind: 'component', title: S(child), layer: 'unassigned', members: { select: [{ pkg: S(child) + '.**' }] } });
    const units = [...model.units.values()].filter(u => u.pkg === child || u.pkg.startsWith(child + '.'));
    const ann = {}; const out = {}; let external = [];
    for (const u of units) {
      for (const a of u.annotations) ann[a] = (ann[a] || 0) + 1;
      if (u.fields.some(f => EXTERNAL_TYPES.test(f.type || '')) || u.methods.some(m => EXTERNAL_TYPES.test(m.params || '') || EXTERNAL_TYPES.test(m.type || ''))) external.push(S(u.id));
    }
    const ids = new Set(units.map(u => u.id));
    for (const p of model.pairs) if (ids.has(p.from) && !ids.has(p.to)) { const t = topPkg(model, model.units.get(p.to).pkg); out[t] = (out[t] || 0) + 1; }
    perPackage[id] = { classes: units.length, annotations: ann, usesMost: Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`), external: external.slice(0, 10) };
  }
  if (rootPkg.units.length) nodes.push({ id: 'root', kind: 'component', title: '(root package)', layer: 'unassigned', members: { select: [{ pkg: '' }] } });
  return { ...base, layout: { direction: 'DOWN' }, layers: [...DEFAULT_LAYERS.map(([id, t]) => ({ id, title: t })), { id: 'unassigned', title: 'Unassigned' }], nodes,
    edges: { derived: [], declared: [], rules: [] },
    hints: { perPackage, families: families.slice(0, 20), entries, note: 'Assign each component to a layer (or merge/split them), nest where the picture nests, add actors (kind actor, shape system|person|store) and declared arrows to them, mark planned boxes. Delete `hints` when done.' } };
}

function topPkg(model, pkg) {
  const s = shortId(model, pkg);
  return s.split('.')[0] || '(root)';
}
