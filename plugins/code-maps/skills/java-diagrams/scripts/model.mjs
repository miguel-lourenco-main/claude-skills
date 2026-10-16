// Turns graph.json (the extractor's output) into bounded views and compiles each view to DOT.
//
// The rule this file exists to keep: a view never drops a relationship. Every dependency in a
// view's scope is either drawn as its own arrow or counted inside an aggregated arrow, and
// verify() in build.mjs re-derives that from the raw pairs to prove it.

export const CAPS = {
  pkgNodes: 30,        // packages drawn individually in a package view
  classNodes: 25,      // classes drawn individually in a class view
  classArrows: 40,     // above this, classes with identical connections are stacked
  pkgArrows: 60,       // above this, packages with identical connections are stacked
  outsideGroups: 10,   // outside packages drawn individually around a view
  ghostSupers: 8,      // outside supertypes drawn as their own class box
  membersUpTo: 12,     // class views with more boxes than this hide members
  fields: 6,
  methods: 8,
  focusFields: 14,
  focusMethods: 18,
  focusNeighbours: 30, // classes drawn individually around a focused class
  labelChars: 46,
};

export const INHERIT = ['extends', 'implements'];
export const KIND_ORDER = ['extends', 'implements', 'field', 'creates', 'param', 'return', 'throws', 'calls', 'reads', 'annotated', 'uses'];

// ───────────────────────── model ─────────────────────────

export function buildModel(graph, { sets = ['main'] } = {}) {
  const types = graph.types.filter(t => sets.includes(t.set));
  const byId = new Map(types.map(t => [t.id, t]));

  // A unit is a top-level type. Nested, local and anonymous types are folded into it.
  const unitIdOf = id => {
    let t = byId.get(id);
    for (let guard = 0; t && guard < 32; guard++) {
      let outer = t.outer && byId.has(t.outer) ? t.outer : null;
      if (!outer && t.id.includes('$')) {
        const guess = t.id.slice(0, t.id.lastIndexOf('$'));
        if (byId.has(guess)) outer = guess;
      }
      if (!outer) break;
      t = byId.get(outer);
    }
    return t?.id;
  };

  const units = new Map();
  for (const t of types) {
    if (unitIdOf(t.id) !== t.id) continue;
    units.set(t.id, {
      id: t.id, name: t.name, pkg: t.pkg, kind: t.kind, abstract: !!t.abstract, vis: t.vis,
      annotations: (t.annotations || []).map(simple), fields: t.fields, methods: t.methods,
      nested: [], source: t.source, line: t.line, superExt: t.super, interfacesExt: t.interfaces || [],
    });
  }
  for (const t of types) {
    const u = unitIdOf(t.id);
    if (u !== t.id && !t.anonymous && !t.local) units.get(u).nested.push({ name: t.id.slice(u.length + 1).replace(/\$/g, '.'), kind: t.kind });
  }

  // One pair per ordered (unit, unit). `kinds` are relations the unit itself has; relations that
  // belong to a nested type are kept apart in `nested` so the diagram never claims that Outer
  // extends something only Outer.Inner extends.
  const pairs = [];
  const pairIndex = new Map();
  let foldedInternal = 0;
  for (const e of graph.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    const from = unitIdOf(e.from), to = unitIdOf(e.to);
    if (from === to) { foldedInternal++; continue; }
    const key = from + ' ' + to;
    let p = pairIndex.get(key);
    if (!p) { p = { i: pairs.length, from, to, kinds: {}, nested: {}, n: 0 }; pairIndex.set(key, p); pairs.push(p); }
    const own = e.from === from;
    const prefix = own ? '' : e.from.slice(from.length + 1).replace(/\$/g, '.') + '.';
    for (const [kind, a] of Object.entries(e.kinds)) {
      const bucket = !own && (INHERIT.includes(kind) || kind === 'field') ? p.nested : p.kinds;
      const acc = bucket[kind] ??= { n: 0, via: [] };
      acc.n += a.n;
      p.n += a.n;
      for (const v of a.via || []) if (acc.via.length < 8) acc.via.push(prefix + v);
      if (!a.via && !own && acc.via.length < 8) acc.via.push(prefix.slice(0, -1));
      if (a.line && (!acc.line || a.line < acc.line)) acc.line = a.line;
    }
    if (own && e.wrap !== undefined && e.kinds.field) p.wrap = p.wrap === '' ? '' : e.wrap;
  }
  for (const p of pairs) {
    p.rel = p.kinds.extends ? 'extends' : p.kinds.implements ? 'implements' : p.kinds.field ? 'field' : 'dep';
  }

  // package tree, rooted at the longest package prefix all units share
  const pkgNames = [...new Set([...units.values()].map(u => u.pkg))];
  let prefix = pkgNames.length ? pkgNames[0].split('.') : [];
  for (const n of pkgNames) {
    const segs = n.split('.');
    let k = 0;
    while (k < prefix.length && k < segs.length && prefix[k] === segs[k]) k++;
    prefix = prefix.slice(0, k);
  }
  const rootName = prefix.join('.');
  const packages = new Map();
  const ensure = full => {
    let p = packages.get(full);
    if (p) return p;
    p = { full, name: full === rootName ? (full || '(default package)') : full.slice(full.lastIndexOf('.') + 1), parent: null, children: [], units: [], total: 0 };
    packages.set(full, p);
    if (full !== rootName) {
      const parent = ensure(full.includes('.') ? full.slice(0, full.lastIndexOf('.')) : '');
      p.parent = parent.full;
      parent.children.push(full);
    }
    return p;
  };
  ensure(rootName);
  for (const u of units.values()) ensure(u.pkg).units.push(u.id);
  for (const p of packages.values()) { p.children.sort(); p.units.sort(); }
  const total = full => { const p = packages.get(full); p.total = p.units.length + p.children.reduce((s, c) => s + total(c), 0); return p.total; };
  total(rootName);

  return { units, pairs, packages, root: rootName, rawTypes: types.length, rawEdges: graph.edges.length, foldedInternal, sets };
}

const simple = fqn => fqn.slice(fqn.lastIndexOf('.') + 1).replace(/\$/g, '.');
export const under = (pkg, anc) => pkg === anc || anc === '' || pkg.startsWith(anc + '.');
const childOf = (pkg, anc) => { const rest = anc === '' ? pkg : pkg.slice(anc.length + 1); const seg = rest.split('.')[0]; return anc === '' ? seg : anc + '.' + seg; };

/** Where a unit that is not drawn individually lands, seen from package `pkgFull`. */
export function groupFor(model, unit, pkgFull) {
  const q = unit.pkg;
  if (q === pkgFull) return { id: 'own:' + pkgFull, type: 'own', pkg: pkgFull, inside: true };
  if (under(q, pkgFull)) { const c = childOf(q, pkgFull); return { id: 'p:' + c, type: 'pkg', pkg: c, inside: true }; }
  let anc = model.packages.get(pkgFull)?.parent;
  while (anc !== null && anc !== undefined) {
    if (q === anc) return { id: 'own:' + anc, type: 'own', pkg: anc, inside: false };
    if (under(q, anc)) { const c = childOf(q, anc); return { id: 'p:' + c, type: 'pkg', pkg: c, inside: false }; }
    anc = model.packages.get(anc).parent;
  }
  return { id: 'p:' + q, type: 'pkg', pkg: q, inside: false };
}

// ───────────────────────── views ─────────────────────────

/**
 * Shared assembly. `place(unit)` returns the node a unit belongs to; `inScope(pair)` says whether
 * a pair must be accounted for. Then oversize views are reduced by two stated rules, in order:
 * nodes with identical connections are stacked, and the lightest remaining ones are folded into
 * a single "N more" node. Edges are re-aggregated after each step, so nothing is lost.
 */
export function assemble(model, { id, title, kind, pkg, focus, place, inScope, stackable, cap, edgeCap = Infinity, order, boundary }) {
  const nodes = new Map();
  const nodeOfUnit = new Map();
  for (const u of model.units.values()) {
    const n = place(u);
    if (!n) continue;
    if (!nodes.has(n.id)) nodes.set(n.id, { ...n, members: [] });
    nodes.get(n.id).members.push(u.id);
    nodeOfUnit.set(u.id, n.id);
  }
  const scope = model.pairs.filter(p => inScope(p) && nodeOfUnit.has(p.from) && nodeOfUnit.has(p.to));
  const remap = new Map();
  const at = uid => { const n = nodeOfUnit.get(uid); return remap.get(n) ?? n; };

  const aggregate = () => {
    const edges = new Map();
    for (const p of scope) {
      let a = at(p.from), b = at(p.to);
      if (a === b) continue;
      if (boundary) {
        // an outside package connects to the package as a whole, not to each class in it
        const na = nodes.get(a), nb = nodes.get(b);
        if (!na.inside && na.type !== 'unit') b = 'scope';
        else if (!nb.inside && nb.type !== 'unit') a = 'scope';
      }
      const key = a + ' ' + b;
      if (!edges.has(key)) edges.set(key, { from: a, to: b, covers: [] });
      edges.get(key).covers.push(p.i);
    }
    return edges;
  };
  const weights = edges => {
    const w = new Map();
    for (const e of edges.values()) for (const n of [e.from, e.to]) if (n !== 'scope') w.set(n, (w.get(n) || 0) + e.covers.length);
    return w;
  };
  const merge = (newId, node, ids) => {
    nodes.set(newId, { ...node, members: ids.flatMap(i => nodes.get(i).members), parts: ids.flatMap(i => nodes.get(i).parts ?? [nodes.get(i)]) });
    for (const i of ids) { remap.set(i, newId); nodes.delete(i); }
    for (const [k, v] of remap) if (ids.includes(v)) remap.set(k, newId);
  };

  // drop nodes that take no part in the view (outside groups with no in-scope pair)
  let edges = aggregate();
  let w = weights(edges);
  for (const [nid, n] of [...nodes]) if (!n.inside && !n.focus && !w.has(nid)) nodes.delete(nid);

  // rule 1: stack inside nodes that have exactly the same connections
  const insideIds = () => [...nodes.values()].filter(n => stackable(n)).map(n => n.id);
  let stacked = 0, folded = 0;
  if (insideIds().length > cap || edges.size > edgeCap) {
    const minStack = insideIds().length > cap ? 2 : 3;
    const profile = new Map(insideIds().map(i => [i, []]));
    for (const e of edges.values()) {
      if (profile.has(e.from)) profile.get(e.from).push('>' + e.to);
      if (profile.has(e.to)) profile.get(e.to).push('<' + e.from);
    }
    const groups = new Map();
    for (const [i, pr] of profile) {
      const key = pr.sort().join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    let k = 0;
    for (const ids of [...groups.values()].sort((a, b) => b.length - a.length)) {
      if (ids.length < minStack) continue;
      ids.sort();
      const first = nodes.get(ids[0]);
      merge(`stack:${k++}`, { id: `stack:${k - 1}`, type: 'stack', of: first.type, inside: true }, ids);
      stacked += ids.length;
    }
    edges = aggregate();
    w = weights(edges);
  }
  // rule 2: fold the lightest inside nodes that still do not fit
  if (insideIds().length > cap) {
    const ranked = insideIds().sort((a, b) => (w.get(b) || 0) - (w.get(a) || 0) || a.localeCompare(b));
    const rest = ranked.slice(cap - 1).sort();
    const of = nodes.get(rest[0]).of ?? nodes.get(rest[0]).type;
    merge('more:in', { id: 'more:in', type: 'more', of, inside: true }, rest);
    folded = nodes.get('more:in').parts.length;
    edges = aggregate();
    w = weights(edges);
  }
  // rule 2 for the outside: keep the heaviest outside groups, fold the rest
  const outside = [...nodes.values()].filter(n => !n.inside && n.type !== 'unit');
  if (outside.length > CAPS.outsideGroups) {
    const ranked = outside.map(n => n.id).sort((a, b) => (w.get(b) || 0) - (w.get(a) || 0) || a.localeCompare(b));
    merge('more:out', { id: 'more:out', type: 'more', of: 'pkg', inside: false }, ranked.slice(CAPS.outsideGroups - 1).sort());
    edges = aggregate();
  }

  // final node and edge lists with stable short ids
  const nodeList = [...nodes.values()].sort(order || ((a, b) => a.id.localeCompare(b.id)));
  nodeList.forEach((n, i) => { n.key = n.id; n.id = 'n' + i; });
  const short = new Map(nodeList.map(n => [n.key, n.id]));
  short.set('scope', 'scope');
  const individual = k => k !== 'scope' && nodes.get(k).type === 'unit';
  const edgeList = [...edges.values()].sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to)).map((e, i) => {
    const single = individual(e.from) && individual(e.to) && e.covers.length === 1;
    return { id: 'e' + i, from: short.get(e.from), to: short.get(e.to), covers: e.covers, kind: single ? model.pairs[e.covers[0]].rel : 'agg' };
  });
  const has = new Set(edgeList.map(e => e.from + ' ' + e.to));
  for (const e of edgeList) e.mutual = has.has(e.to + ' ' + e.from);

  const unitNode = new Map();
  for (const [uid] of nodeOfUnit) { const k = at(uid); if (nodes.has(k)) unitNode.set(uid, short.get(k)); }
  // a boundary edge is anchored on the inside node that carries most of it
  for (const e of edgeList) {
    if (e.from !== 'scope' && e.to !== 'scope') continue;
    const tally = new Map();
    for (const i of e.covers) {
      const p = model.pairs[i];
      const n = unitNode.get(e.from === 'scope' ? p.from : p.to);
      tally.set(n, (tally.get(n) || 0) + 1);
    }
    e.anchor = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }
  return { id, title, kind, pkg, focus, nodes: nodeList, edges: edgeList, unitNode, scope: scope.map(p => p.i), stacked, folded };
}

const insideFirst = (a, b) => (b.inside - a.inside) || a.id.localeCompare(b.id);

/** Sub-packages of a package and the dependencies between them, with the outside world around. */
export function packageView(model, pkgFull) {
  const pkg = model.packages.get(pkgFull);
  if (!pkg.children.length) return null;
  const inside = u => under(u.pkg, pkgFull);
  return assemble(model, {
    id: 'p.' + (pkgFull || '_'), title: pkgFull || '(default package)', kind: 'packages', pkg: pkgFull,
    place: u => groupFor(model, u, pkgFull),
    inScope: p => inside(model.units.get(p.from)) || inside(model.units.get(p.to)),
    stackable: n => n.inside && n.type === 'pkg',
    cap: CAPS.pkgNodes, edgeCap: CAPS.pkgArrows, order: insideFirst, boundary: true,
  });
}

/** The classes declared directly in a package, with supertypes and package-level context around. */
export function classView(model, pkgFull) {
  const pkg = model.packages.get(pkgFull);
  if (!pkg.units.length) return null;
  const own = new Set(pkg.units);
  // outside supertypes of this package's classes get their own box
  const inheritors = new Map();
  for (const p of model.pairs) {
    if (own.has(p.from) && !own.has(p.to) && INHERIT.includes(p.rel)) inheritors.set(p.to, (inheritors.get(p.to) || 0) + 1);
  }
  const ghosts = new Set([...inheritors].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, CAPS.ghostSupers).map(x => x[0]));
  return assemble(model, {
    id: 'c.' + (pkgFull || '_'), title: pkgFull || '(default package)', kind: 'classes', pkg: pkgFull,
    place: u => own.has(u.id) ? { id: 'u:' + u.id, type: 'unit', unit: u.id, inside: true }
      : ghosts.has(u.id) ? { id: 'u:' + u.id, type: 'unit', unit: u.id, inside: false }
      : { ...groupFor(model, u, pkgFull), inside: false },
    inScope: p => own.has(p.from) || own.has(p.to),
    stackable: n => n.inside && n.type === 'unit',
    cap: CAPS.classNodes, edgeCap: CAPS.classArrows, order: insideFirst, boundary: true,
  });
}

/** One class and everything it touches or is touched by. */
export function focusView(model, unitId) {
  const focus = model.units.get(unitId);
  const touching = new Map();
  for (const p of model.pairs) {
    if (p.from !== unitId && p.to !== unitId) continue;
    const other = p.from === unitId ? p.to : p.from;
    const rank = INHERIT.includes(p.rel) ? 0 : p.rel === 'field' ? 1 : 2;
    const t = touching.get(other) || { rank: 3, n: 0 };
    touching.set(other, { rank: Math.min(t.rank, rank), n: t.n + p.n });
  }
  const chosen = new Set([...touching].sort((a, b) => a[1].rank - b[1].rank || b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, CAPS.focusNeighbours).map(x => x[0]));
  return assemble(model, {
    id: 'u.' + unitId, title: focus.name, kind: 'focus', pkg: focus.pkg, focus: unitId,
    place: u => u.id === unitId ? { id: 'u:' + u.id, type: 'unit', unit: u.id, inside: true, focus: true }
      : chosen.has(u.id) ? { id: 'u:' + u.id, type: 'unit', unit: u.id, inside: false }
      : touching.has(u.id) ? { ...groupFor(model, u, focus.pkg), inside: false } : null,
    inScope: p => p.from === unitId || p.to === unitId,
    stackable: () => false,
    cap: Infinity,
    order: (a, b) => (!!b.focus - !!a.focus) || a.id.localeCompare(b.id),
  });
}

export function allViews(model) {
  const views = [];
  for (const full of [...model.packages.keys()].sort()) {
    const pv = packageView(model, full); if (pv) views.push(pv);
    const cv = classView(model, full); if (cv) views.push(cv);
  }
  for (const id of [...model.units.keys()].sort()) views.push(focusView(model, id));
  return views;
}

// ───────────────────────── DOT ─────────────────────────

// Colours are fixed tokens. The HTML page restyles them per theme by matching these exact values.
export const INK = {
  text: '#1b2430', muted: '#687385', line: '#56606e', box: '#fdfdfb',
  headClass: '#e4ebf6', headInterface: '#dff1e8', headData: '#f5ecd9', headGhost: '#eeeeea',
  pkg: '#eef1f6', pkgOut: '#f6f6f3', frame: '#b9c0cb',
  inherit: '#1b2431', assoc: '#2c5ea8', dep: '#7d8794', faint: '#b4bac3', mutual: '#b3421c',
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n = CAPS.labelChars) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const BOILERPLATE = new Set(['equals(Object)', 'hashCode()', 'toString()']);
const VIS = { public: '+', protected: '#', private: '-', package: '~' };
const visRank = { public: 0, protected: 1, package: 2, private: 3 };
const lastSeg = full => full.slice(full.lastIndexOf('.') + 1);

export function relLabel(pair) {
  if (pair.rel === 'field') {
    const names = pair.kinds.field.via;
    return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
  }
  if (pair.rel === 'dep') {
    if (pair.kinds.creates) return '«creates»';
    const inh = pair.nested.extends || pair.nested.implements;
    if (inh) return `${inh.via[0] || 'nested'} inherits`;
  }
  return '';
}

export function multiplicity(pair) {
  if (pair.rel !== 'field' || pair.wrap === undefined || pair.wrap === '') return '';
  return pair.wrap === 'java.util.Optional' ? '0..1' : '*';
}

function unitLabel(model, node, view, showMembers) {
  const u = model.units.get(node.unit);
  const head = node.inside ? (u.kind === 'interface' || u.kind === 'annotation' ? INK.headInterface : u.kind === 'class' ? INK.headClass : INK.headData) : INK.headGhost;
  const stereo = [];
  if (u.kind !== 'class') stereo.push(u.kind);
  else if (u.abstract) stereo.push('abstract');
  for (const a of u.annotations) if (stereo.length < 3 && !['FunctionalInterface', 'Deprecated', 'SuppressWarnings'].includes(a)) stereo.push(a);
  const rows = [];
  let title = '';
  if (stereo.length) title += `<FONT POINT-SIZE="9" COLOR="${INK.muted}">«${esc(stereo.join(', '))}»</FONT><BR/>`;
  title += u.abstract || u.kind === 'interface' ? `<B><I>${esc(u.name)}</I></B>` : `<B>${esc(u.name)}</B>`;
  if (!node.inside || view.kind === 'focus') title += `<BR/><FONT POINT-SIZE="9" COLOR="${INK.muted}">${esc(clip(u.pkg, 52))}</FONT>`;
  rows.push(`<TR><TD BGCOLOR="${head}" CELLPADDING="6">${title}</TD></TR>`);
  if (showMembers) {
    const maxF = node.focus ? CAPS.focusFields : CAPS.fields, maxM = node.focus ? CAPS.focusMethods : CAPS.methods;
    const byVis = (a, b) => visRank[a.vis] - visRank[b.vis];
    const isConstant = f => u.kind === 'enum' && f.static && f.type === u.name;
    const constants = u.fields.filter(isConstant);
    const fields = u.fields.filter(f => !isConstant(f) && !(u.kind === 'enum' && f.name === '$VALUES')).sort(byVis);
    const accessors = u.kind === 'record' ? new Set(u.fields.map(f => f.name)) : new Set();
    const methods = u.methods.filter(m => !m.ctor && !BOILERPLATE.has(`${m.name}(${m.params})`)
      && !(u.kind === 'enum' && (m.name === 'values' || m.name === 'valueOf') && m.static)
      && !(accessors.has(m.name) && m.params === '')).sort(byVis);
    const line = s => esc(clip(s)) + '<BR ALIGN="LEFT"/>';
    const block = (items, max, fmt, what) => {
      if (!items.length) return;
      let cell = items.slice(0, max).map(m => line(fmt(m))).join('');
      if (items.length > max) cell += `<FONT COLOR="${INK.muted}">${line(`+${items.length - max} more ${what}`)}</FONT>`;
      rows.push(`<TR><TD ALIGN="LEFT" BALIGN="LEFT"><FONT POINT-SIZE="10">${cell}</FONT></TD></TR>`);
    };
    block(constants, maxF + 4, f => f.name, 'constants');
    block(fields, maxF, f => `${VIS[f.vis]} ${f.name}: ${f.type}`, 'fields');
    block(methods, maxM, m => `${VIS[m.vis]} ${m.name}(${m.params})${m.type && m.type !== 'void' ? ': ' + m.type : ''}`, 'methods');
    if (u.nested.length) {
      const names = u.nested.map(n => n.name);
      rows.push(`<TR><TD ALIGN="LEFT" BALIGN="LEFT"><FONT POINT-SIZE="9" COLOR="${INK.muted}">${line('nested: ' + names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : ''))}</FONT></TD></TR>`);
    }
  }
  return `<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4" BGCOLOR="${INK.box}" COLOR="${INK.line}">${rows.join('')}</TABLE>>`;
}

export function nodeText(model, n) {
  const names = () => {
    const list = (n.parts || []).map(p => p.type === 'unit' ? model.units.get(p.unit).name : lastSeg(p.pkg));
    return list.slice(0, 3).join(', ') + (list.length > 3 ? ', …' : '');
  };
  switch (n.type) {
    case 'pkg': return { main: n.inside ? lastSeg(n.pkg) : n.pkg.startsWith(model.root + '.') ? n.pkg.slice(model.root.length + 1) : n.pkg, sub: `${n.members.length} ${n.members.length === 1 ? 'class' : 'classes'}` };
    case 'own': return { main: `${n.pkg === model.root ? lastSeg(n.pkg) || '(default)' : n.pkg.startsWith(model.root + '.') ? n.pkg.slice(model.root.length + 1) : n.pkg} · own classes`, sub: `${n.members.length} ${n.members.length === 1 ? 'class' : 'classes'}` };
    case 'stack': return { main: `${n.parts.length} ${n.of === 'unit' ? 'classes' : 'packages'} with the same connections`, sub: names() };
    case 'more': return { main: `${n.parts.length} more ${n.of === 'unit' ? 'classes' : 'packages'}`, sub: names() };
    default: return { main: model.units.get(n.unit).name, sub: '' };
  }
}

export function toDot(model, view) {
  const out = [];
  const unitBoxes = view.nodes.filter(n => n.type === 'unit' && n.inside).length;
  const showMembers = view.kind === 'focus' ? null : unitBoxes <= CAPS.membersUpTo;
  out.push('digraph G {');
  out.push(`  graph [rankdir=TB, nodesep=0.35, ranksep=0.7, fontname="Helvetica", fontsize=11, fontcolor="${INK.muted}", bgcolor="transparent", pad=0.2, newrank=true, compound=true];`);
  out.push(`  node [fontname="Helvetica", fontsize=11, fontcolor="${INK.text}", color="${INK.line}"];`);
  out.push(`  edge [fontname="Helvetica", fontsize=9, fontcolor="${INK.muted}", color="${INK.dep}", arrowsize=0.8];`);

  const nodeLine = n => {
    if (n.type === 'unit') {
      const members = view.kind === 'focus' ? !!n.focus : showMembers && n.inside;
      return `    ${n.id} [id="${n.id}", class="${n.inside ? 'unit' : 'unit ghost'}${n.focus ? ' focus' : ''}", shape=plain, label=${unitLabel(model, n, view, members)}];`;
    }
    const t = nodeText(model, n);
    const label = `<<B>${esc(clip(t.main, 44))}</B><BR/><FONT POINT-SIZE="9" COLOR="${INK.muted}">${esc(clip(t.sub, 52))}</FONT>>`;
    const shape = n.type === 'pkg' ? 'tab' : n.type === 'own' ? 'box' : 'box3d';
    const fill = n.inside ? INK.pkg : INK.pkgOut;
    return `    ${n.id} [id="${n.id}", class="${n.type}${n.inside ? '' : ' ghost'}", shape=${shape}, style="filled${n.inside ? '' : ',dashed'}", fillcolor="${fill}", margin="0.18,0.1", label=${label}];`;
  };

  const inside = view.nodes.filter(n => n.inside), outside = view.nodes.filter(n => !n.inside);
  if (view.kind !== 'focus') {
    out.push(`  subgraph cluster_scope {`);
    out.push(`    label="${view.pkg || '(default package)'}"; labeljust=l; style="rounded"; color="${INK.frame}"; margin=14;`);
    for (const n of inside) out.push(nodeLine(n));
    out.push('  }');
  } else {
    for (const n of inside) out.push(nodeLine(n));
  }
  for (const n of outside) out.push(nodeLine(n));

  const implied = view.kind === 'packages' ? impliedEdges(view) : new Set();
  for (const e of view.edges) {
    const attrs = [`id="${e.id}"`];
    let from = e.from, to = e.to;
    if (from === 'scope') { from = e.anchor; attrs.push('ltail=cluster_scope'); }
    if (to === 'scope') { to = e.anchor; attrs.push('lhead=cluster_scope'); }
    if (e.kind === 'extends' || e.kind === 'implements') {
      // drawn supertype-on-top: the arrow is emitted reversed and its head put at the tail
      [from, to] = [to, from];
      attrs.push(`class="${e.kind}"`, 'dir=back', 'arrowtail=onormal', `color="${INK.inherit}"`, 'arrowsize=1.1');
      if (e.kind === 'implements') attrs.push('style=dashed');
    } else if (e.kind === 'field') {
      const p = model.pairs[e.covers[0]];
      attrs.push('class="field"', 'arrowhead=vee', `color="${INK.assoc}"`, `fontcolor="${INK.assoc}"`);
      const l = relLabel(p), m = multiplicity(p);
      if (l) attrs.push(`label="${esc(clip(l, 30))}"`);
      if (m) attrs.push(`headlabel="${m}"`, 'labeldistance=1.6');
    } else if (e.kind === 'dep') {
      const l = relLabel(model.pairs[e.covers[0]]);
      attrs.push('class="dep"', 'arrowhead=vee', 'style=dashed');
      if (l) attrs.push(`label="${esc(l)}"`);
    } else {
      const n = e.covers.length;
      const inh = e.covers.filter(i => INHERIT.includes(model.pairs[i].rel)).length;
      const faint = implied.has(e.id) && !e.mutual;
      attrs.push(`class="agg${e.mutual ? ' mutual' : ''}${faint ? ' implied' : ''}"`, 'arrowhead=vee',
        `penwidth=${faint ? '0.8' : (0.9 + Math.log2(n) * 0.28).toFixed(2)}`, `label="${n}${inh ? ` (${inh} inherit)` : ''}"`);
      if (faint) attrs.push(`color="${INK.faint}"`, `fontcolor="${INK.faint}"`);
      if (e.mutual) attrs.push(`color="${INK.mutual}"`, `fontcolor="${INK.mutual}"`);
    }
    out.push(`  ${from} -> ${to} [${attrs.join(', ')}];`);
  }
  out.push('}');
  return out.join('\n');
}

/**
 * Package arrows that add no new reachability: A -> C when A already reaches C through other,
 * stronger arrows. They are still drawn and still counted, only fainter, so the skeleton shows.
 * Lightest arrows are tested first and an arrow is only demoted if the path uses arrows that
 * stay strong, so every dependency remains reachable along strong arrows.
 */
export function impliedEdges(view) {
  const strong = new Set(view.edges.map(e => e.id));
  const out = new Map();
  for (const e of view.edges) { if (!out.has(e.from)) out.set(e.from, []); out.get(e.from).push(e); }
  for (const e of [...view.edges].sort((a, b) => a.covers.length - b.covers.length || a.id.localeCompare(b.id))) {
    if (e.from === 'scope' || e.to === 'scope') continue;
    const seen = new Set([e.from]);
    const queue = [e.from];
    let found = false;
    while (queue.length && !found) {
      const n = queue.shift();
      for (const x of out.get(n) || []) {
        if (x === e || !strong.has(x.id) || x.to === 'scope' || seen.has(x.to)) continue;
        if (x.to === e.to) { found = true; break; }
        seen.add(x.to);
        queue.push(x.to);
      }
    }
    if (found) strong.delete(e.id);
  }
  return new Set(view.edges.filter(e => !strong.has(e.id)).map(e => e.id));
}

export function kindSummary(pair) {
  const parts = [];
  for (const k of KIND_ORDER) if (pair.kinds[k]) parts.push(k);
  for (const k of Object.keys(pair.nested)) parts.push('nested ' + k);
  return parts;
}
