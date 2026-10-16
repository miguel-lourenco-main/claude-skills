// The map document, projected onto the extracted graph. Pure: no Node imports, so the same code
// runs in map.mjs (the CLI) and inside the page (inlined by pack.mjs).
//
// What a person writes is MEMBERSHIP (which classes a box stands for) and WORDS. Every arrow
// between code boxes is aggregated here from the graph's pairs and accounted for: each pair in
// scope is covered by exactly one edge, and an edge never claims a pair it does not cover.
import { assemble, CAPS, INHERIT, KIND_ORDER } from '../../java-diagrams/scripts/model.mjs';

export const FORMAT = 'code-maps/map@1';
export const KINDS = ['actor', 'component', 'package', 'stack', 'class'];
export const GROUP_KINDS = ['component', 'package'];
export const SHAPES = ['system', 'person', 'store', 'row'];
export const REL_RANK = { extends: 0, implements: 1, field: 2, dep: 3, weak: 4 };
export const RULES = ['implied', 'nonAdjacentLayers'];
const STRONG = ['creates', 'calls', 'reads'];
const BOILER = new Set(['equals', 'hashCode', 'toString']);

export const WORDS = {
  pt: {
    kinds: { extends: 'estende', implements: 'implementa', field: 'campo', creates: 'cria', calls: 'chama', reads: 'lê', param: 'parâmetro', return: 'devolve', throws: 'lança', annotated: 'anotada com', uses: 'usa' },
    nested: ' (classe interna)', creates: 'cria', nestedInherits: 'classe interna herda', of: 'de',
    why: { drawOnly: 'só se desenha a herança deste grupo', implied: 'já implicada por um caminho de outras setas', nonAdjacentLayers: 'entre componentes que não são vizinhos no fluxo' },
  },
  en: {
    kinds: { extends: 'extends', implements: 'implements', field: 'field', creates: 'creates', calls: 'calls', reads: 'reads', param: 'parameter', return: 'returns', throws: 'throws', annotated: 'annotated with', uses: 'uses' },
    nested: ' (nested type)', creates: 'creates', nestedInherits: 'nested type inherits', of: 'of',
    why: { drawOnly: 'only this group\'s inheritance is drawn', implied: 'already implied by a path of other arrows', nonAdjacentLayers: 'between components that are not neighbours in the flow' },
  },
};
export const wordsOf = doc => WORDS[doc?.meta?.lang] || WORDS.en;

// ───────────────────────── the graph side ─────────────────────────

/** A fifth relation: named only in a signature (parameter, return, throws, annotation). */
export function rel5(p) {
  const k = p.kinds;
  if (k.extends) return 'extends';
  if (k.implements) return 'implements';
  if (k.field) return 'field';
  if (Object.keys(p.nested).length || STRONG.some(x => k[x])) return 'dep';
  return 'weak';
}

/** FNV-1a 64 over the sorted unit ids and the sorted pairs with their kinds: the same in Node and the browser. */
export function graphHash(model) {
  let h = 0xcbf29ce484222325n;
  const P = 0x100000001b3n, M = (1n << 64n) - 1n;
  const feed = s => { for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * P) & M; } h ^= 10n; h = (h * P) & M; };
  for (const id of [...model.units.keys()].sort()) feed(id);
  for (const k of model.pairs.map(p => `${p.from}>${p.to}:${Object.keys(p.kinds).sort().join(',')}`).sort()) feed(k);
  return h.toString(16).padStart(16, '0');
}

/** The model as plain JSON, and back: what the page embeds instead of graph.json. */
export function compactModel(model) {
  return {
    root: model.root, sets: model.sets, rawTypes: model.rawTypes, rawEdges: model.rawEdges, foldedInternal: model.foldedInternal,
    units: [...model.units.values()].map(u => ({ id: u.id, name: u.name, pkg: u.pkg, kind: u.kind, abstract: u.abstract || undefined, vis: u.vis,
      annotations: u.annotations.length ? u.annotations : undefined, fields: u.fields, methods: u.methods, nested: u.nested.length ? u.nested : undefined,
      source: u.source, line: u.line, superExt: u.superExt, interfacesExt: u.interfacesExt.length ? u.interfacesExt : undefined })),
    pairs: model.pairs.map(p => ({ from: p.from, to: p.to, kinds: p.kinds, nested: Object.keys(p.nested).length ? p.nested : undefined, n: p.n, wrap: p.wrap })),
    packages: [...model.packages.values()],
  };
}
export function inflateModel(c) {
  const units = new Map(c.units.map(u => [u.id, { ...u, abstract: !!u.abstract, annotations: u.annotations || [], nested: u.nested || [], interfacesExt: u.interfacesExt || [], fields: u.fields || [], methods: u.methods || [] }]));
  const pairs = c.pairs.map((p, i) => ({ i, from: p.from, to: p.to, kinds: p.kinds, nested: p.nested || {}, n: p.n, wrap: p.wrap }));
  for (const p of pairs) p.rel = p.kinds.extends ? 'extends' : p.kinds.implements ? 'implements' : p.kinds.field ? 'field' : 'dep';
  const packages = new Map(c.packages.map(p => [p.full, { ...p, children: [...p.children], units: [...p.units] }]));
  return { units, pairs, packages, root: c.root, rawTypes: c.rawTypes, rawEdges: c.rawEdges, foldedInternal: c.foldedInternal, sets: c.sets };
}

/** Ids in a document are relative to the root package. */
export const shortId = (model, full) => model.root && full.startsWith(model.root + '.') ? full.slice(model.root.length + 1) : full === model.root ? '' : full;
export const fullId = (model, short) => model.units.has(short) || model.packages.has(short) ? short : short === '' ? model.root : model.root ? model.root + '.' + short : short;
/**
 * The package the document's ids are relative to: `meta.root` when the document pins one (so a
 * rename above it changes nothing), else the longest package every class shares. Returns the
 * refusal when the pinned root is not in the graph.
 */
export function applyRoot(doc, model) {
  const root = doc?.meta?.root;
  if (root === undefined) return null;
  if (!model.packages.has(root)) return `meta.root ${root} is not a package in the graph (the classes share ${model.root || '(default package)'})`;
  model.root = root;
  return null;
}
const isAbove = (pkg, root) => pkg === root || root.startsWith(pkg + '.');   // an ancestor of the root, or the root itself
const simpleType = t => (t || '').trim().replace(/(?:\b[a-z_]\w*\.)+/g, '');
const lastSeg = s => s.slice(s.lastIndexOf('.') + 1);

// ───────────────────────── validation ─────────────────────────

const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const SELECTOR_KEYS = ['pkg', 'implements', 'extends', 'annotated', 'name', 'transitive'];

/** Shape of the authored document. Returns the refusals (empty = valid). Nothing here needs the graph. */
export function validate(doc) {
  const errs = [];
  const err = (m) => errs.push(m);
  if (!isObj(doc)) return ['the document is not an object'];
  if (doc.format !== FORMAT) err(`format must be "${FORMAT}"`);
  const meta = doc.meta || {};
  if (![0, 1, 2, 3].includes(meta.tier)) err('meta.tier must be 0, 1, 2 or 3');
  if (meta.lang && !WORDS[meta.lang]) err(`meta.lang must be one of ${Object.keys(WORDS).join(', ')}`);
  if (meta.auto !== undefined && meta.auto !== 'packages') err('meta.auto must be "packages" when present');
  if (meta.root !== undefined && typeof meta.root !== 'string') err('meta.root must be a package name');
  if (doc.layout && doc.layout.direction && !['DOWN', 'RIGHT', 'UP', 'LEFT'].includes(doc.layout.direction)) err('layout.direction must be DOWN, RIGHT, UP or LEFT');
  if (doc.layout && doc.layout.boundary && !['root', 'open', 'none'].includes(doc.layout.boundary)) err('layout.boundary must be "root", "open" or "none"');
  if (doc.layout && doc.layout.openDirection !== undefined && !['DOWN', 'RIGHT', 'UP', 'LEFT'].includes(doc.layout.openDirection)) err('layout.openDirection must be DOWN, RIGHT, UP or LEFT');
  if (doc.layout && doc.layout.packClosed !== undefined && typeof doc.layout.packClosed !== 'boolean') err('layout.packClosed must be true or false');
  if (doc.layout && doc.layout.labels && !['words', 'all'].includes(doc.layout.labels)) err('layout.labels must be "words" or "all"');
  if (doc.layout && doc.layout.arrows !== undefined && !['flow', 'bands', 'calls', 'all'].includes(doc.layout.arrows)) err('layout.arrows must be "flow", "bands", "calls" or "all"');
  if (meta.process !== undefined && typeof meta.process !== 'string') err('meta.process must be the path of the process file that states the chain order');
  if (meta.chainRunner !== undefined && typeof meta.chainRunner !== 'string') err('meta.chainRunner must be the id of the box that runs the chain');
  for (const [i, l] of (doc.edges?.loops || []).entries()) {
    if (!isObj(l) || !(l.at || (l.from && l.to))) { err(`edges.loops[${i}] needs at, or from and to`); continue; }
    if (typeof l.label !== 'string' || !l.label) err(`edges.loops[${i}]: label is required (what the loop runs over)`);
    if (typeof l.source !== 'string' || !/:\d+/.test(l.source)) err(`edges.loops[${i}]: source must cite the file and line that holds the loop (File.java:123)`);
  }
  const layers = Array.isArray(doc.layers) ? doc.layers : [];
  const layerIds = new Set();
  layers.forEach((l, i) => { if (!isObj(l) || !l.id) err(`layers[${i}] needs an id`); else if (layerIds.has(l.id)) err(`layer ${l.id} twice`); else layerIds.add(l.id); });
  const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  if (!Array.isArray(doc.nodes)) err('nodes must be an array');
  const byId = new Map();
  nodes.forEach((n, i) => {
    if (!isObj(n) || !n.id) { err(`nodes[${i}] needs an id`); return; }
    if (byId.has(n.id)) err(`node ${n.id} twice`);
    byId.set(n.id, n);
    if (n.id.includes('/own') || n.id.includes('>')) err(`node ${n.id}: ids may not contain "/own" or ">"`);
  });
  for (const n of byId.values()) {
    const where = `node ${n.id}`;
    if (n.kind !== undefined && !KINDS.includes(n.kind)) err(`${where}: kind must be one of ${KINDS.join(', ')}`);
    if (n.parent !== undefined) {
      if (!byId.has(n.parent)) err(`${where}: parent ${n.parent} does not exist`);
      if (n.layer !== undefined) err(`${where}: layer is allowed on root nodes only (children inherit it)`);
    }
    if (n.layer !== undefined && !layerIds.has(n.layer)) err(`${where}: unknown layer ${n.layer}`);
    if (n.kind === 'actor') {
      if (n.members || n.unit || n.alias) err(`${where}: an actor has no members`);
      if (n.shape !== undefined && !SHAPES.includes(n.shape)) err(`${where}: shape must be one of ${SHAPES.join(', ')}`);
      if (n.entry !== undefined && (typeof n.entry !== 'string' || n.kind !== 'class')) err(`${where}: entry names a method of a class box`);
    }
    if (n.kind === 'class') {
      if (n.members) err(`${where}: a class node names one unit (id or unit), not members`);
      if (n.alias && n.unit) err(`${where}: alias or unit, not both`);
    }
    if (n.kind === 'stack' && !n.members) err(`${where}: a stack needs members`);
    if (n.planned && (n.members || n.unit)) err(`${where}: a planned box has no members`);
    if (n.members !== undefined) {
      if (!isObj(n.members)) err(`${where}: members must be an object {units, select, except, optional}`);
      else {
        for (const k of ['units']) if (n.members[k] !== undefined && !Array.isArray(n.members[k])) err(`${where}: members.${k} must be an array`);
        for (const k of ['select', 'except']) for (const [j, s] of (n.members[k] || []).entries()) {
          if (!isObj(s) || !Object.keys(s).some(x => SELECTOR_KEYS.includes(x) && x !== 'transitive')) err(`${where}: members.${k}[${j}] is not a selector (${SELECTOR_KEYS.join('|')})`);
          for (const x of Object.keys(s)) if (!SELECTOR_KEYS.includes(x)) err(`${where}: members.${k}[${j}] has an unknown key ${x}`);
        }
      }
    }
    if (n.keys !== undefined && (!isObj(n.keys) || (n.keys.fields && !Array.isArray(n.keys.fields)) || (n.keys.methods && !Array.isArray(n.keys.methods)))) err(`${where}: keys must be {fields:[], methods:[]}`);
    if (n.show !== undefined && !['name', 'keys', 'all'].includes(n.show)) err(`${where}: show must be name, keys or all`);
    if (n.pos !== undefined && !(Array.isArray(n.pos) && n.pos.length === 2 && n.pos.every(Number.isFinite))) err(`${where}: pos must be [x, y]`);
    if (n.drawOnly !== undefined && !(Array.isArray(n.drawOnly) && n.drawOnly.every(k => k in REL_RANK))) err(`${where}: drawOnly lists relations (${Object.keys(REL_RANK).join(', ')})`);
    if (n.quiet !== undefined && typeof n.quiet !== 'string') err(`${where}: quiet is the reason, a string`);
    if (n.flow !== undefined && !['DOWN', 'RIGHT', 'UP', 'LEFT'].includes(n.flow)) err(`${where}: flow must be DOWN, RIGHT, UP or LEFT`);
  }
  // cycles
  for (const n of byId.values()) {
    const seen = new Set();
    for (let x = n; x; x = byId.get(x.parent)) { if (seen.has(x.id)) { err(`node ${n.id}: parent cycle`); break; } seen.add(x.id); }
  }
  for (const n of byId.values()) {
    const p = byId.get(n.parent);
    if (p && (p.kind === 'class' || p.kind === 'actor' || p.kind === 'stack')) err(`node ${n.id}: a ${p.kind} has no children`);
  }
  const edges = doc.edges || {};
  for (const [i, e] of (edges.derived || []).entries()) {
    if (!isObj(e) || !e.from || !e.to) { err(`edges.derived[${i}] needs from and to`); continue; }
    if (e.hide !== undefined && (typeof e.hide !== 'string' || !e.hide.trim())) err(`edges.derived[${i}] ${e.from} -> ${e.to}: hide needs a reason`);
    for (const k of ['covers', 'ev', 'n', 'rel', 'drawn']) if (e[k] !== undefined) err(`edges.derived[${i}] ${e.from} -> ${e.to}: ${k} is computed, not written`);
  }
  for (const [i, e] of (edges.declared || []).entries()) {
    if (!isObj(e) || !e.from || !e.to) { err(`edges.declared[${i}] needs from and to`); continue; }
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) { err(`edges.declared[${i}] ${e.from} -> ${e.to}: unknown node`); continue; }
    const ok = x => x.kind === 'actor' || x.planned;
    if (!ok(a) && !ok(b)) err(`edges.declared[${i}] ${e.from} -> ${e.to}: a declared arrow needs an actor or a planned box at one end; arrows between code boxes come from the graph`);
    for (const k of ['covers', 'ev', 'n', 'rel']) if (e[k] !== undefined) err(`edges.declared[${i}] ${e.from} -> ${e.to}: ${k} is evidence, and a declared arrow has none`);
  }
  for (const [i, r] of (edges.rules || []).entries()) {
    if (!isObj(r) || !RULES.includes(r.rule)) err(`edges.rules[${i}]: rule must be one of ${RULES.join(', ')}`);
    else if (r.scope !== undefined && !['top', 'inside', 'all'].includes(r.scope)) err(`edges.rules[${i}] ${r.rule}: scope must be top, inside or all`);
  }
  return errs;
}

// ───────────────────────── membership ─────────────────────────

const globRe = g => new RegExp('^' + g.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

/** The units one selector matches, as full ids. */
export function selectUnits(model, sel, inheritors) {
  const out = new Set();
  if (sel.pkg !== undefined) {
    const raw = String(sel.pkg);
    const base = fullId(model, raw.replace(/(\.\*\*|\.\*|^\*\*)$/, '')), mode = raw.endsWith('.**') || raw === '**' ? 'all' : raw.endsWith('.*') ? 'children' : 'exact';
    for (const u of model.units.values()) {
      const q = u.pkg;
      const hit = mode === 'exact' ? q === base
        : mode === 'children' ? q !== base && q.startsWith(base ? base + '.' : '') && !q.slice(base ? base.length + 1 : 0).includes('.')
        : raw === '**' || q === base || q.startsWith(base + '.');
      if (hit) out.add(u.id);
    }
  }
  for (const k of ['implements', 'extends']) if (sel[k] !== undefined) {
    const target = fullId(model, sel[k]);
    const direct = t => (inheritors.get(t) || []).filter(x => x.kind === k).map(x => x.from);
    const todo = direct(target), seen = new Set();
    while (todo.length) { const x = todo.pop(); if (seen.has(x)) continue; seen.add(x); out.add(x); if (sel.transitive) todo.push(...direct(x).map(y => y)); }
    if (sel.transitive) for (const x of [...seen]) for (const y of (inheritors.get(x) || [])) { if (!seen.has(y.from)) { seen.add(y.from); out.add(y.from); todo.push(y.from); } }
  }
  if (sel.annotated !== undefined) for (const u of model.units.values()) if (u.annotations.includes(sel.annotated)) out.add(u.id);
  if (sel.name !== undefined) { const re = globRe(String(sel.name)); for (const u of model.units.values()) if (re.test(u.name)) out.add(u.id); }
  if (sel.pkg === undefined && sel.implements === undefined && sel.extends === undefined && sel.annotated === undefined && sel.name === undefined) return out;
  // several keys in one selector are ANDed
  const keys = ['pkg', 'implements', 'extends', 'annotated', 'name'].filter(k => sel[k] !== undefined);
  if (keys.length > 1) {
    let acc = null;
    for (const k of keys) { const s = selectUnits(model, { [k]: sel[k], transitive: sel.transitive }, inheritors); acc = acc ? new Set([...acc].filter(x => s.has(x))) : s; }
    return acc;
  }
  return out;
}

const inheritorsOf = model => {
  const m = new Map();
  for (const p of model.pairs) for (const k of INHERIT) if (p.kinds[k]) { if (!m.has(p.to)) m.set(p.to, []); m.get(p.to).push({ from: p.from, kind: k }); }
  return m;
};

/**
 * Resolves the document against the model: generates the automatic nodes (meta.auto), claims
 * every unit for exactly one node, and returns the context every other function reads.
 * `ctx.errors` holds the refusals; a context with errors must not be projected.
 */
export function resolve(doc, model) {
  const errors = [];
  const err = m => errors.push(m);
  const rootErr = applyRoot(doc, model);
  if (rootErr) err(rootErr);
  const inheritors = inheritorsOf(model);
  const nodes = new Map();              // id -> { ...authored, units:[], children:[], depth, root }
  const add = n => nodes.set(n.id, { ...n, units: [], children: [] });
  for (const n of doc.nodes || []) add({ kind: 'component', ...n });

  // explicit claims first: class nodes and members.units
  const owner = new Map();              // unit -> node id
  const claim = (unit, nid, how) => {
    const prev = owner.get(unit);
    if (prev !== undefined && prev !== nid) { err(`${shortId(model, unit)} is claimed by both ${prev} and ${nid} (${how})`); return; }
    owner.set(unit, nid);
  };
  const unitOf = (n, s) => { const f = fullId(model, s); if (!model.units.has(f)) { err(`node ${n.id}: ${s} is not a class in the graph`); return null; } return f; };
  for (const n of nodes.values()) {
    if (n.kind === 'class' && !n.alias) {
      const u = unitOf(n, n.unit || n.id);
      if (u) { n.unit = u; claim(u, n.id, 'class node'); }
    }
    for (const s of n.members?.units || []) { const u = unitOf(n, s); if (u) claim(u, n.id, 'members.units'); }
  }
  // automatic nodes: one per package, one per unit nobody claimed
  if (doc.meta?.auto === 'packages') {
    for (const p of [...model.packages.values()].sort((a, b) => a.full.localeCompare(b.full))) {
      if (isAbove(p.full, model.root)) continue;   // the root and what is above it are the sheet, not boxes
      const id = 'p:' + shortId(model, p.full);
      const parent = p.parent === null || isAbove(p.parent, model.root) ? undefined : 'p:' + shortId(model, p.parent);
      if (nodes.has(id)) { const n = nodes.get(id); n.kind = 'package'; n.parent ??= parent; n.auto = true; }
      else add({ id, kind: 'package', title: p.name, parent, auto: true });
    }
    for (const u of model.units.values()) {
      if (owner.has(u.id)) continue;
      const id = shortId(model, u.id);
      const parent = isAbove(u.pkg, model.root) ? undefined : 'p:' + shortId(model, u.pkg);
      if (nodes.has(id)) { const n = nodes.get(id); n.kind = 'class'; n.unit = u.id; n.parent ??= parent; n.auto = true; claim(u.id, id, 'class node'); }
      else { add({ id, kind: 'class', unit: u.id, parent, auto: true }); claim(u.id, id, 'auto'); }
    }
  }
  // tree
  for (const n of nodes.values()) {
    if (n.parent !== undefined) { const p = nodes.get(n.parent); if (!p) { err(`node ${n.id}: parent ${n.parent} does not exist`); continue; } p.children.push(n.id); }
  }
  const depthOf = n => { let d = 0; for (let x = n; x.parent !== undefined && nodes.has(x.parent); x = nodes.get(x.parent)) d++; return d; };
  for (const n of nodes.values()) { n.depth = depthOf(n); let r = n; while (r.parent !== undefined && nodes.has(r.parent)) r = nodes.get(r.parent); n.root = r.id; n.layer = r.layer; }
  const isAncestor = (a, b) => { for (let x = nodes.get(b); x && x.parent !== undefined; x = nodes.get(x.parent)) if (x.parent === a) return true; return false; };

  // selectors: deepest claimant wins along one line of ancestry, a same-level double claim is refused
  const bySelector = new Map();          // unit -> [node ids]
  const selected = new Map();            // node id -> Set(units)
  for (const n of nodes.values()) {
    if (!n.members?.select?.length) continue;
    let s = new Set();
    for (const sel of n.members.select) for (const u of selectUnits(model, sel, inheritors)) s.add(u);
    for (const sel of n.members.except || []) for (const u of selectUnits(model, sel, inheritors)) s.delete(u);
    selected.set(n.id, s);
    for (const u of s) { if (!bySelector.has(u)) bySelector.set(u, []); bySelector.get(u).push(n.id); }
  }
  for (const [u, ids] of bySelector) {
    if (owner.has(u)) continue;          // explicit claims beat selectors
    let winner = ids[0];
    for (const id of ids.slice(1)) {
      if (isAncestor(winner, id)) winner = id;
      else if (isAncestor(id, winner)) { /* keep */ }
      else { err(`${shortId(model, u)} is selected by both ${winner} and ${id}, which are not one inside the other`); winner = null; break; }
    }
    if (winner) owner.set(u, winner);
  }
  for (const n of nodes.values()) {
    const explicit = (n.members?.units || []).length || (n.kind === 'class' && !n.alias);
    const got = [...owner].filter(([, id]) => id === n.id).length;
    if (n.members?.select?.length && !explicit && !got && !n.members.optional) err(`node ${n.id}: its selectors match nothing (or everything they match is claimed elsewhere); set members.optional if that is intended`);
    if (n.count !== undefined && got !== n.count) err(`node ${n.id}: count says ${n.count}, the graph gives ${got}`);
  }
  for (const [u, id] of owner) nodes.get(id).units.push(u);
  for (const n of nodes.values()) n.units.sort();
  // aliases
  const aliasesOf = new Map();
  for (const n of nodes.values()) {
    if (n.kind !== 'class' || !n.alias) continue;
    const u = unitOf(n, n.alias);
    if (!u) continue;
    n.unit = u;
    if (!owner.has(u)) err(`node ${n.id}: alias of ${n.alias}, which no node owns`);
    if (!aliasesOf.has(u)) aliasesOf.set(u, []);
    aliasesOf.get(u).push(n.id);
  }
  const unowned = [...model.units.keys()].filter(u => !owner.has(u)).sort();
  if (doc.meta?.auto === 'packages' && unowned.length) err(`${unowned.length} classes are owned by no node in an automatic document`);
  // the drawn units for autoKeys: every unit shown as its own box
  const curated = new Set([...nodes.values()].filter(n => n.kind === 'class' && n.unit).map(n => n.unit));
  return { doc, model, nodes, owner, unowned, aliasesOf, curated, inheritors, errors, isAncestor, words: wordsOf(doc) };
}

// ───────────────────────── projection ─────────────────────────

export const expandable = n => GROUP_KINDS.includes(n.kind) && n.children.length > 0;

/** The groups open at first: a node's `collapsed`, and with meta.single every root group closed. */
export function defaultExpansion(ctx) {
  const open = new Set();
  for (const n of ctx.nodes.values()) {
    if (!expandable(n)) continue;
    if (ctx.doc.meta?.single && n.parent === undefined) continue;
    if (!n.collapsed) open.add(n.id);
  }
  return open;
}
export const fullExpansion = ctx => new Set([...ctx.nodes.values()].filter(expandable).map(n => n.id));

/**
 * The drawing for one expansion state: visible boxes, the derived arrows aggregated from the
 * pairs with their evidence and words, and the declared arrows. `expanded` is a Set of open group ids.
 */
export function project(ctx, expanded) {
  const { doc, model, nodes, owner, aliasesOf, words } = ctx;
  const isOpen = id => expanded.has(id);
  const pathOf = id => { const path = []; for (let x = nodes.get(id); x; x = x.parent !== undefined ? nodes.get(x.parent) : null) path.unshift(x.id); return path; };
  const visibleNode = id => { const path = pathOf(id); for (const a of path.slice(0, -1)) if (expandable(nodes.get(a)) && !isOpen(a)) return a; return id; };
  const isVisible = id => visibleNode(id) === id;
  // where a unit lands, by ownership alone
  const landing = u => {
    const n = owner.get(u);
    const v = visibleNode(n);
    if (v !== n) return v;
    const node = nodes.get(n);
    if (expandable(node) && isOpen(n)) return n + '/own';
    return n;
  };
  const rootOf = id => nodes.get(id.replace(/\/own$/, '')).root;
  const within = (id, group) => { const base = id.replace(/\/own$/, ''); return base === group || ctx.isAncestor(group, base); };
  // an alias is the unit as seen from inside its group: pairs to that group's other boxes land on it
  const endpoint = (u, otherVisible) => {
    let best = null;
    for (const a of aliasesOf.get(u) || []) {
      if (!isVisible(a)) continue;
      const p = nodes.get(a).parent;
      if (p === undefined || !within(otherVisible, p)) continue;
      if (!best || nodes.get(a).depth > nodes.get(best).depth) best = a;
    }
    return best || landing(u);
  };
  const boundary = doc.layout?.boundary || (doc.meta?.tier === 2 ? 'root' : 'none');
  // 'open': an arrow that leaves an open box is drawn from the box's frame, not from the class inside it —
  // the outermost open ancestor of the end that does not also hold the other end
  const attach = (id, other) => { const own = id.endsWith('/own'), path = pathOf(own ? id.slice(0, -4) : id); for (const anc of own ? path : path.slice(0, -1)) { if (expandable(nodes.get(anc)) && isOpen(anc) && !within(other, anc)) return anc; } return id; };
  // the same boundary rule for every arrow, derived or declared
  const bound = (a, b) => { if (boundary === 'root' && rootOf(a) !== rootOf(b)) return [rootOf(a), rootOf(b)]; if (boundary === 'open') return [attach(a, b), attach(b, a)]; return [a, b]; };

  // visible boxes
  const vis = new Map();
  for (const n of nodes.values()) {
    if (!isVisible(n.id)) continue;
    const open = expandable(n) && isOpen(n.id);
    const sub = open ? [] : subtreeUnits(ctx, n.id);
    vis.set(n.id, { id: n.id, kind: n.kind, parent: n.parent, layer: n.layer, open, units: sub, count: sub.length, node: n });
    if (open && n.units.length) vis.set(n.id + '/own', { id: n.id + '/own', kind: 'own', parent: n.id, layer: n.layer, open: false, units: n.units.slice(), count: n.units.length, node: n });
  }

  // derived edges
  const groups = new Map();
  let inScope = 0, touchingUnowned = 0, inside = 0;
  for (const p of model.pairs) {
    if (!owner.has(p.from) || !owner.has(p.to)) { touchingUnowned++; continue; }
    const la = landing(p.from), lb = landing(p.to);
    let a = endpoint(p.from, lb), b = endpoint(p.to, la);
    [a, b] = bound(a, b);
    if (a === b) { inside++; continue; }
    inScope++;
    const key = a + '>' + b;
    if (!groups.has(key)) groups.set(key, { from: a, to: b, covers: [] });
    groups.get(key).covers.push(p.i);
  }
  const overlay = new Map();
  for (const e of doc.edges?.derived || []) overlay.set(e.from + '>' + e.to, e);
  const rules = new Map();
  for (const r of doc.edges?.rules || []) rules.set(r.rule, { scope: r.scope || (r.rule === 'implied' ? 'inside' : 'top'), why: r.why || words.why[r.rule] });
  const layerIdx = new Map((doc.layers || []).map((l, i) => [l.id, i]));
  const edges = [];
  for (const g of groups.values()) {
    const ps = g.covers.map(i => model.pairs[i]);
    const rel = ps.map(rel5).sort((x, y) => REL_RANK[x] - REL_RANK[y])[0];
    const na = vis.get(g.from).node, nb = vis.get(g.to).node;
    const e = { id: '', from: g.from, to: g.to, rel, n: ps.length, covers: g.covers, kinds: kindsOf(ps), drawn: true, why: '', label: '', tech: '', desc: '', mutual: false, ev: evidence(ctx, ps) };
    e.tech = techOf(ctx, e, ps, vis);
    // words written for this very pair of boxes; else, when the boxes are closed, the one worded pair folded inside them
    let ov = overlay.get(g.from + '>' + g.to);
    if (!ov) {
      const under = (id, box) => id === box || (nodes.has(id) && nodes.has(box) && ctx.isAncestor(box, id)) || (id.endsWith('/own') && id.slice(0, -4) === box);
      // an own-classes box inherits nothing: words written for a pair inside the group are about the group's boxes, not its loose classes
      const end = (id, box) => box.endsWith('/own') ? id === box : under(id, box);
      const inside = [...overlay.values()].filter(o => !o.hide && end(o.from, g.from) && end(o.to, g.to));
      if (inside.length === 1) ov = inside[0];
    }
    if (ov) { if (ov.label) e.label = ov.label; if (ov.desc) e.desc = ov.desc; e.worded = !!(ov.label || ov.desc); e.inherited = ov !== overlay.get(g.from + '>' + g.to) || undefined; }
    const drawOnly = [na, nb].map(n => n.drawOnly).find(Boolean);
    const sameRoot = rootOf(g.from) === rootOf(g.to);
    const inScopeOf = scope => scope === 'all' || (scope === 'inside' ? sameRoot : !sameRoot);
    if (drawOnly && !drawOnly.includes(rel)) { e.drawn = false; e.why = words.why.drawOnly; }
    else if (INHERIT.includes(rel) || rel === 'field') { /* always drawn */ }
    else if (nb.quiet) { e.drawn = false; e.why = nb.quiet; }
    else if (ov?.hide) { e.drawn = false; e.why = ov.hide; }
    if (e.drawn && rules.has('nonAdjacentLayers') && inScopeOf(rules.get('nonAdjacentLayers').scope)) {
      const la = layerIdx.get(nodes.get(rootOf(g.from)).layer), lb = layerIdx.get(nodes.get(rootOf(g.to)).layer);
      if (la !== undefined && lb !== undefined && Math.abs(la - lb) > 1) { e.drawn = false; e.why = rules.get('nonAdjacentLayers').why; }
    }
    e.sameRoot = sameRoot;
    edges.push(e);
  }
  // a plain "uses" arrow that a path of other drawn arrows already implies is listed, not drawn
  if (rules.has('implied')) {
    const r = rules.get('implied');
    const adj = new Map();
    for (const e of edges) if (e.drawn) { if (!adj.has(e.from)) adj.set(e.from, new Set()); adj.get(e.from).add(e.to); }
    for (const e of edges) {
      const applies = r.scope === 'all' || (r.scope === 'inside' ? e.sameRoot : !e.sameRoot);
      const plain = e.drawn && applies && (e.rel === 'dep' || e.rel === 'weak') && !e.worded && !e.kinds.includes('creates') && !e.kinds.some(k => k.startsWith('nested '));
      if (plain && impliedIn(adj, e.from, e.to)) { e.drawn = false; e.why = r.why; adj.get(e.from).delete(e.to); }
    }
  }
  const has = new Set(edges.map(e => e.from + '>' + e.to));
  edges.sort((x, y) => x.covers[0] - y.covers[0]);
  edges.forEach((e, i) => { e.id = 'e' + i; e.mutual = has.has(e.to + '>' + e.from); delete e.sameRoot; delete e.worded; });

  // declared edges, attached to whatever is visible
  const declared = [];
  const seenD = new Set();
  for (const d of doc.edges?.declared || []) {
    if (!nodes.has(d.from) || !nodes.has(d.to)) continue;
    const [a, b] = bound(visibleNode(d.from), visibleNode(d.to));
    if (a === b) continue;
    const key = a + '>' + b + '|' + (d.label || '') + (d.both ? '<>' : '');
    if (seenD.has(key)) continue;
    seenD.add(key);
    declared.push({ id: 'd' + declared.length, from: a, to: b, label: d.label || '', desc: d.desc || '', both: !!d.both, declared: true, drawn: true, of: [d.from, d.to] });
  }
  return { nodes: vis, edges, declared, inScope, inside, touchingUnowned, expanded: new Set(expanded), boundary };
}

export function subtreeUnits(ctx, id) {
  const out = [];
  const walk = x => { const n = ctx.nodes.get(x); out.push(...n.units); for (const c of n.children) walk(c); };
  walk(id);
  return out.sort();
}

function impliedIn(adj, a, b) {
  const seen = new Set([a]), todo = [a];
  while (todo.length) {
    const x = todo.pop();
    for (const y of adj.get(x) || []) {
      if ((x === a && y === b) || seen.has(y)) continue;
      if (y === b) return true;
      seen.add(y); todo.push(y);
    }
  }
  return false;
}

function kindsOf(ps) {
  const s = new Set();
  for (const p of ps) { for (const k of KIND_ORDER) if (p.kinds[k]) s.add(k); for (const k of Object.keys(p.nested)) s.add('nested ' + k); }
  return [...s];
}

/** What the drawing itself says about the arrow: the field names and multiplicity, «creates», or the share of a stack. */
function techOf(ctx, e, ps, vis) {
  const { words, model } = ctx;
  const rel = e.rel;
  const labelOf = p => {
    const r = rel5(p);
    if (r === 'field') {
      const names = p.kinds.field.via;
      const mult = p.wrap === undefined || p.wrap === '' ? '' : p.wrap === 'java.util.Optional' ? ' 0..1' : ' *';
      return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '') + mult;
    }
    if (r === 'dep') {
      if (p.kinds.creates) return words.creates;
      if (p.nested.extends || p.nested.implements) return words.nestedInherits;
    }
    return '';
  };
  const stackSide = ['from', 'to'].find(side => vis.get(e[side])?.kind === 'stack');
  if (stackSide) {
    const sid = e[stackSide], size = vis.get(sid).count;
    const k = new Set(ps.map(p => stackSide === 'from' ? p.from : p.to)).size;
    const same = new Set(ps.filter(p => rel5(p) === rel).map(labelOf));
    const extra = same.size === 1 ? [...same][0] : '';
    const share = k < size ? `${k} ${words.of} ${size}` : size > 1 ? `${size}×` : '';
    return [share, extra].filter(Boolean).join(' · ');
  }
  if (ps.length === 1) return labelOf(ps[0]);
  const targets = new Map();
  for (const p of ps) targets.set(p.to, (targets.get(p.to) || 0) + 1);
  const top = [...targets].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0];
  return model.units.get(top).name + (targets.size > 1 ? ` +${targets.size - 1}` : '');
}

function evidence(ctx, ps) {
  const { words, model } = ctx;
  return ps.slice().sort((x, y) => REL_RANK[rel5(x)] - REL_RANK[rel5(y)]).slice(0, 14).map(p => ({
    a: model.units.get(p.from).name, b: model.units.get(p.to).name, rel: rel5(p),
    items: [[p.kinds, false], [p.nested, true]].flatMap(([bucket, inner]) => Object.entries(bucket).map(([k, x]) => [
      (words.kinds[k] || k) + (inner ? words.nested : ''), x.via.join(', ') + (x.n > x.via.length && x.via.length ? ' …' : ''), x.line || 0, x.n])),
  }));
}

// ───────────────────────── accounting ─────────────────────────

/**
 * Re-derives from the raw pairs what the projection must satisfy, without using project()'s own
 * aggregation: every pair between two owned units that land on different boxes is covered by
 * exactly one edge whose ends hold those units, nothing else is covered, relations are not
 * overstated, every undrawn arrow has a reason, declared arrows carry no evidence.
 */
export function account(ctx, proj) {
  const { model, nodes, owner } = ctx;
  const f = [];
  const fail = m => f.push(m);
  const holds = (nid, u) => {
    const v = proj.nodes.get(nid);
    if (!v) return false;
    if (v.units.includes(u)) return true;
    if (v.kind === 'class' && v.node.alias && v.node.unit === u) return true;
    if (v.open) { for (const c of nodes.get(nid).children) if (proj.nodes.has(c) ? holds(c, u) : subtreeUnits(ctx, c).includes(u)) return true; if (proj.nodes.has(nid + '/own') && holds(nid + '/own', u)) return true; }
    return false;
  };
  const covered = new Map();
  for (const e of proj.edges) {
    for (const i of e.covers) { if (covered.has(i)) fail(`pair ${i} covered twice`); covered.set(i, e); }
    if (!proj.nodes.has(e.from) || !proj.nodes.has(e.to)) fail(`edge ${e.id} joins a box that is not visible`);
    if (e.from === e.to) fail(`edge ${e.id} joins a box to itself`);
    if (!e.drawn && !e.why) fail(`edge ${e.id} ${e.from} -> ${e.to} is not drawn and gives no reason`);
    const strongest = e.covers.map(i => rel5(model.pairs[i])).sort((x, y) => REL_RANK[x] - REL_RANK[y])[0];
    if (e.rel !== strongest) fail(`edge ${e.id} says ${e.rel}, its strongest pair is ${strongest}`);
    if (e.covers.length === 1 && proj.nodes.get(e.from)?.kind === 'class' && proj.nodes.get(e.to)?.kind === 'class' && e.rel !== rel5(model.pairs[e.covers[0]])) fail(`edge ${e.id} drawn as ${e.rel} for a ${rel5(model.pairs[e.covers[0]])} pair`);
    for (const k of e.kinds) if (!e.covers.some(i => (k.startsWith('nested ') ? model.pairs[i].nested[k.slice(7)] : model.pairs[i].kinds[k]))) fail(`edge ${e.id} claims ${k} and no covered pair has it`);
  }
  let expected = 0;
  for (const p of model.pairs) {
    const e = covered.get(p.i);
    if (!owner.has(p.from) || !owner.has(p.to)) { if (e) fail(`edge ${e.id} covers ${p.from} -> ${p.to}, which touches an unowned class`); continue; }
    if (!e) {
      // not covered: both ends must sit on one visible box
      const boxes = [...proj.nodes.keys()].filter(id => holds(id, p.from) && holds(id, p.to) && !proj.nodes.get(id).open);
      if (!boxes.length) fail(`MISSING ${shortId(model, p.from)} -> ${shortId(model, p.to)}: covered by no edge and on no single box`);
      continue;
    }
    expected++;
    if (!holds(e.from, p.from) && !(proj.boundary === 'root' && nodes.get(owner.get(p.from)).root === e.from)) fail(`edge ${e.id}: ${shortId(model, p.from)} is not on its from box ${e.from}`);
    if (!holds(e.to, p.to) && !(proj.boundary === 'root' && nodes.get(owner.get(p.to)).root === e.to)) fail(`edge ${e.id}: ${shortId(model, p.to)} is not on its to box ${e.to}`);
  }
  if (covered.size !== expected) fail(`edges cover ${covered.size} pairs, ${expected} are in scope`);
  for (const d of proj.declared) {
    const a = nodes.get(d.of[0]), b = nodes.get(d.of[1]);
    if (!(a?.kind === 'actor' || a?.planned || b?.kind === 'actor' || b?.planned)) fail(`declared ${d.from} -> ${d.to} joins two code boxes`);
    if (d.covers || d.ev || d.n) fail(`declared ${d.from} -> ${d.to} carries evidence`);
  }
  const seen = new Set();
  for (const n of nodes.values()) for (const u of n.units) { if (seen.has(u)) fail(`${u} is a member of two nodes`); seen.add(u); }
  if (seen.size + ctx.unowned.length !== model.units.size) fail(`owned ${seen.size} + unowned ${ctx.unowned.length} ≠ ${model.units.size} classes`);
  return f;
}

// ───────────────────────── the words a class box prints ─────────────────────────

const VISCH = { public: '+', protected: '#', private: '-', package: '~' };
function splitTop(params) {
  const out = []; let depth = 0, cur = '';
  for (const ch of params || '') { if (ch === '<') depth++; else if (ch === '>') depth--; if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
const sigOf = m => { const t = `${m.name}(${splitTop(m.params).map(simpleType).join(', ')})${m.type ? ': ' + simpleType(m.type) : ''}`; return t.length <= 60 ? t : t.slice(0, 59) + '…'; };

/**
 * The fields that hold another drawn class and the methods the other drawn classes call (the
 * entry point first, then what the interfaces it implements ask for), three of each — or the
 * `keys` the document names. Port of build_class_map.py's rule.
 */
export function autoKeys(ctx, unitId, keys) {
  const { model, curated } = ctx;
  const u = model.units.get(unitId);
  const entry = ctx.doc.meta?.entryMethods || [];
  const fieldsAll = u.fields.filter(f => !f.static);
  const methodsAll = u.methods.filter(m => !m.ctor);
  const accessors = u.kind === 'record' ? new Set(fieldsAll.map(f => f.name)) : new Set();
  const byName = new Map(methodsAll.filter(m => !accessors.has(m.name)).map(m => [m.name, m]));
  if (keys) {
    const bad = [...(keys.fields || []), ...(keys.methods || [])].filter(n => !fieldsAll.some(f => f.name === n) && !byName.has(n));
    if (bad.length) return { error: `keys name something ${u.name} does not have: ${bad.join(', ')}` };
    return { fields: fieldsAll.filter(f => (keys.fields || []).includes(f.name)).map(f => `${f.name}: ${simpleType(f.type)}`),
             methods: (keys.methods || []).filter(n => byName.has(n)).map(n => sigOf(byName.get(n))) };
  }
  const held = [];
  const called = new Map();
  for (const p of model.pairs) {
    if (p.from === unitId && curated.has(p.to) && p.kinds.field) held.push(...p.kinds.field.via);
    if (p.to === unitId && curated.has(p.from) && p.kinds.calls) for (const via of p.kinds.calls.via) {
      const callee = via.split('→').pop();
      if (callee && !callee.startsWith('<') && !callee.startsWith('lambda')) called.set(callee, (called.get(callee) || 0) + 1);
    }
  }
  const fields = (fieldsAll.filter(f => held.includes(f.name)).length ? fieldsAll.filter(f => held.includes(f.name)) : fieldsAll.slice(0, 2)).slice(0, 3);
  const wanted = entry.filter(n => byName.has(n));
  const push = n => { if (byName.has(n) && !wanted.includes(n) && !BOILER.has(n)) wanted.push(n); };
  for (const iface of u.interfacesExt) if (model.units.has(iface)) for (const m of model.units.get(iface).methods) push(m.name);
  for (const [n] of [...called].sort((x, y) => y[1] - x[1])) push(n);   // ties keep first-seen order, as Counter.most_common does
  if (u.kind === 'interface') for (const m of methodsAll) if (m.vis === 'public') push(m.name);
  return { fields: fields.map(f => `${f.name}: ${simpleType(f.type)}`), methods: wanted.slice(0, 3).map(n => sigOf(byName.get(n))) };
}

/** Everything the side panel says about one class, from the model alone (phrases come from the node). */
export function classFacts(ctx, unitId) {
  const { model } = ctx;
  const u = model.units.get(unitId);
  let usedBy = 0, uses = 0, subs = 0;
  for (const p of model.pairs) { if (p.to === unitId) { usedBy++; if (INHERIT.includes(rel5(p))) subs++; } if (p.from === unitId) uses++; }
  const pub = u.methods.filter(m => m.vis === 'public' && !m.ctor && !BOILER.has(m.name));
  return {
    name: u.name, pkg: shortId(model, u.pkg), kind: u.kind, abstract: !!u.abstract && u.kind === 'class', source: u.source, line: u.line,
    annotations: u.annotations, extends: u.superExt ? shortId(model, u.superExt) : undefined, implements: u.interfacesExt.map(i => shortId(model, i)),
    fields: u.fields.filter(f => !f.static).slice(0, 14).map(f => [f.name, f.type || '']),
    methods: pub.slice(0, 16).map(m => `${m.name}(${m.params || ''})${m.type ? ': ' + m.type : ''}`), nMethods: pub.length,
    nested: u.nested.slice(0, 10).map(n => n.name), usedBy, uses, subs,
  };
}

// ───────────────────────── reductions (tier 3) ─────────────────────────

/**
 * For an open group with more boxes than CAPS.classNodes: the two stated rules of model.mjs
 * (stack boxes with identical connections, fold the lightest into one «more» box), applied to
 * the group's direct children. Returns automatic stack nodes to splice in, or [].
 */
export function reductions(ctx, groupId, expanded) {
  const { model, nodes, owner } = ctx;
  const g = nodes.get(groupId);
  if (!g || g.reduce === false || !expandable(g) || !expanded.has(groupId)) return [];
  const direct = g.children.filter(c => !(expandable(nodes.get(c)) && expanded.has(c)));
  if (direct.length + (g.units.length ? 1 : 0) <= CAPS.classNodes) return [];
  const childOfUnit = new Map();
  for (const c of g.children) for (const u of subtreeUnits(ctx, c)) childOfUnit.set(u, c);
  for (const u of g.units) childOfUnit.set(u, groupId + '/own');
  const inside = new Set([...childOfUnit.keys()]);
  const outsideOf = u => { const n = owner.get(u); return n ? nodes.get(n).root : null; };
  const view = assemble(model, {
    id: 'r.' + groupId, title: groupId, kind: 'classes', pkg: '',
    place: u => inside.has(u.id) ? { id: childOfUnit.get(u.id), type: direct.includes(childOfUnit.get(u.id)) ? 'unit' : 'pkg', inside: true, stackable: direct.includes(childOfUnit.get(u.id)) }
      : owner.has(u.id) ? { id: 'out:' + outsideOf(u.id), type: 'pkg', inside: false } : null,
    inScope: p => inside.has(p.from) || inside.has(p.to),
    stackable: n => n.inside && n.stackable,
    cap: CAPS.classNodes, edgeCap: CAPS.classArrows, boundary: false,
  });
  const out = [];
  for (const n of view.nodes) {
    if (!n.inside || (n.type !== 'stack' && n.type !== 'more')) continue;   // more:out is the outside world folded, not ours
    const ids = n.parts.map(p => p.id);
    out.push({ id: `${groupId}/${n.type === 'stack' ? 'stack' : 'more'}:${out.length}`, kind: 'stack', parent: groupId, auto: n.type === 'stack' ? 'same-connections' : 'lightest', of: ids });
  }
  return out;
}

/** The context with the automatic stacks of every open group spliced in (children reparented under them). */
export function withReductions(ctx, expanded) {
  const extra = [];
  for (const id of expanded) extra.push(...reductions(ctx, id, expanded));
  if (!extra.length) return ctx;
  const nodes = new Map([...ctx.nodes].map(([k, v]) => [k, { ...v, children: [...v.children], units: [...v.units] }]));
  const owner = new Map(ctx.owner);
  for (const s of extra) {
    const parent = nodes.get(s.parent);
    const node = { ...s, title: s.title, units: [], children: [], depth: parent.depth + 1, root: parent.root, layer: parent.layer, collapsed: true };
    nodes.set(s.id, node);
    for (const c of s.of) {
      if (c.endsWith('/own')) { node.units.push(...parent.units); for (const u of parent.units) owner.set(u, s.id); parent.units = []; continue; }
      const child = nodes.get(c);
      parent.children = parent.children.filter(x => x !== c);
      child.parent = s.id; node.children.push(c);
      for (const u of subtreeUnits({ nodes }, c)) {} // membership stays with the child; the stack is a frame-less box over them
    }
    parent.children.push(s.id);
    node.units = [...new Set([...node.units, ...node.children.flatMap(c => subtreeUnits({ nodes }, c))])].sort();
    for (const c of node.children) { nodes.get(c).units = []; }
    for (const u of node.units) owner.set(u, s.id);
    node.children = [];
    // a folded child is absorbed whole: its subtree's boxes go, their classes are the stack's
    const drop = id => { for (const k of nodes.get(id)?.children || []) drop(k); nodes.delete(id); };
    for (const c of s.of) if (!c.endsWith('/own')) drop(c);
    node.of = s.of;
    node.units.sort();
  }
  for (const n of nodes.values()) { let d = 0; for (let x = n; x.parent !== undefined && nodes.has(x.parent); x = nodes.get(x.parent)) d++; n.depth = d; }
  const isAncestor = (a, b) => { for (let x = nodes.get(b); x && x.parent !== undefined; x = nodes.get(x.parent)) if (x.parent === a) return true; return false; };
  return { ...ctx, nodes, owner, isAncestor, reduced: extra.map(e => e.id) };
}

// ───────────────────────── levels and the document ─────────────────────────

/** The states the report proves: everything open, the default, everything closed, and each root group alone. */
export function levels(ctx) {
  const out = {};
  const roots = [...ctx.nodes.values()].filter(n => n.parent === undefined && expandable(n));
  const run = (name, expanded) => {
    const c = withReductions(ctx, expanded);
    const proj = project(c, expanded);
    const failures = account(c, proj);
    const drawn = proj.edges.filter(e => e.drawn).length;
    const whyCounts = {};
    for (const e of proj.edges) if (!e.drawn) whyCounts[e.why] = (whyCounts[e.why] || 0) + 1;
    out[name] = { visible: proj.nodes.size, edges: proj.edges.length, drawn, listed: proj.edges.length - drawn, declared: proj.declared.length,
      pairsInScope: proj.inScope, pairsInsideOneBox: proj.inside, whyCounts, accounted: failures.length === 0, failures, reduced: c.reduced || [],
      wordsMissing: proj.edges.filter(e => e.drawn && !e.label && proj.nodes.get(e.from).kind !== 'own' && proj.nodes.get(e.to).kind !== 'own').map(e => `${e.from} -> ${e.to}`) };
  };
  run('full', fullExpansion(ctx));
  run('default', defaultExpansion(ctx));
  run('top', new Set());
  if (ctx.doc.meta?.single) for (const r of roots) {
    const exp = new Set([r.id]);
    for (const n of ctx.nodes.values()) if (expandable(n) && n.root === r.id && n.id !== r.id && !n.collapsed) exp.add(n.id);
    run('open:' + r.id, exp);
  }
  return out;
}

/** Overlays whose two boxes no pair joins: stale words. */
export function staleWords(ctx) {
  const { doc, model, nodes, owner } = ctx;
  const out = [];
  const unitsUnder = id => id.endsWith('/own') ? (nodes.get(id.slice(0, -4))?.units || []) : nodes.has(id) ? (nodes.get(id).kind === 'class' ? [nodes.get(id).unit] : subtreeUnits(ctx, id)) : null;
  for (const e of doc.edges?.derived || []) {
    const a = unitsUnder(e.from), b = unitsUnder(e.to);
    if (!a || !b) { out.push({ edge: e, why: 'unknown box' }); continue; }
    if (e.from !== e.to && (nodes.has(e.from) && nodes.has(e.to)) && (ctx.isAncestor(e.from, e.to) || ctx.isAncestor(e.to, e.from))) { out.push({ edge: e, why: 'one box is inside the other' }); continue; }
    const A = new Set(a), B = new Set(b);
    const joined = model.pairs.some(p => A.has(p.from) && B.has(p.to));
    if (!joined) out.push({ edge: e, why: 'no relation runs between these boxes' });
  }
  return out;
}

const COMPUTED_NODE = ['units', 'children', 'depth', 'root', 'auto', 'of'];
/** The authored document only: what the editor downloads and the CLI writes back. Keeps a stable key order. */
export function stripComputed(doc) {
  const order = ['format', 'meta', 'layout', 'layers', 'nodes', 'edges', 'hints'];
  const nodeOrder = ['id', 'kind', 'title', 'tag', 'entry', 'parent', 'layer', 'phrase', 'note', 'planned', 'legacy', 'shape', 'style', 'alias', 'unit', 'members', 'count', 'keys', 'show', 'drawOnly', 'quiet', 'collapsed', 'flow', 'reduce', 'drill', 'pos'];
  const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; for (const k of Object.keys(o)) if (!(k in r) && o[k] !== undefined) r[k] = o[k]; return r; };
  const out = pick(doc, order);
  out.nodes = (doc.nodes || []).map(n => { const c = pick(n, nodeOrder); for (const k of COMPUTED_NODE) delete c[k]; if (c.kind === 'class' && !c.alias && c.unit && (c.unit === c.id || c.unit.endsWith('.' + c.id))) delete c.unit; return c; });
  if (out.edges) {
    out.edges = { derived: (doc.edges.derived || []).map(e => pick(e, ['from', 'to', 'label', 'desc', 'hide'])), declared: (doc.edges.declared || []).map(e => pick(e, ['from', 'to', 'label', 'desc', 'both'])), rules: (doc.edges.rules || []).map(r => pick(r, ['rule', 'scope', 'why'])), ...(doc.edges.loops ? { loops: doc.edges.loops.map(l => pick(l, ['at', 'from', 'to', 'label', 'source'])) } : {}) };
  }
  delete out.resolved;
  return out;
}

/** The resolved document: the authored one plus what the page needs that only the graph can give. */
export function resolvedDocument(ctx, { docs = {}, sourcesOf = () => ({}) } = {}) {
  const { doc, model, nodes } = ctx;
  const authored = stripComputed(doc);
  const rnodes = {};
  for (const n of nodes.values()) {
    const r = { kind: n.kind, parent: n.parent, units: n.units.map(u => shortId(model, u)), count: subtreeUnits(ctx, n.id).length, children: n.children, auto: n.auto || undefined, of: n.of };
    if (n.kind === 'class' && n.unit) {
      const k = autoKeys(ctx, n.unit, n.keys);
      r.unit = shortId(model, n.unit);
      r.facts = { ...classFacts(ctx, n.unit), keyFields: k.fields || [], keyMethods: k.methods || [], ...sourcesOf(n.unit) };
      const d = docs[r.unit];
      if (r.facts.doc && d && d.en === r.facts.doc) r.facts.docPt = d.pt;
    }
    if (n.kind === 'stack') r.members = n.units.map(u => { const unit = model.units.get(u); return [unit.name, shortId(model, u)]; });
    rnodes[n.id] = r;
  }
  return { ...authored, meta: { ...authored.meta, graph: { hash: graphHash(model), units: model.units.size, pairs: model.pairs.length, root: model.root, sets: model.sets } },
    resolved: { nodes: rnodes, unowned: ctx.unowned.map(u => shortId(model, u)), levels: levels(ctx) } };
}
