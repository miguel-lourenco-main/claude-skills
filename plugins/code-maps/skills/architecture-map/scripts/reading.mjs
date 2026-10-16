// A plain-text reading of a resolved map, for a reviewer who cannot open the page: the boxes,
// their words, the arrows drawn and the ones listed with their reasons. Generic port of
// class-map-reading.md.
import { project, defaultExpansion, expandable, subtreeUnits, autoKeys, shortId } from './core.mjs';

export function reading(ctx, lv) {
  const { doc, model, nodes } = ctx;
  const S = u => shortId(model, u);
  const name = id => id.endsWith('/own') ? `${title(id.slice(0, -4))} (own classes)` : title(id);
  const title = id => { const n = nodes.get(id); return n ? (n.title || (n.kind === 'class' ? model.units.get(n.unit).name : id)) : id; };
  const L = [];
  const g = doc.meta.graph || {};
  L.push(`# ${doc.meta.title || 'Map'} — reading (tier ${doc.meta.tier})`, '');
  L.push(`${model.units.size} classes, ${model.pairs.length} relations read from bytecode${g.hash ? ` (graph ${g.hash})` : ''}. ${model.units.size - ctx.unowned.length} classes are on the map, ${ctx.unowned.length} are not.`, '');
  const layers = new Map((doc.layers || []).map(l => [l.id, l.title || l.id]));
  const roots = [...nodes.values()].filter(n => n.parent === undefined);
  L.push('## Top level', '');
  for (const r of roots) {
    const n = subtreeUnits(ctx, r.id).length;
    L.push(`- ${r.layer ? `[${layers.get(r.layer) || r.layer}] ` : ''}${r.kind}: **${title(r.id)}**${r.planned ? ' (planned)' : ''}${r.phrase ? ` — ${r.phrase}` : ''}${n ? ` (${n} classes)` : ''}`);
  }
  const top = project(ctx, new Set());
  if (top.edges.length || top.declared.length) {
    L.push('', 'Arrows between top-level boxes:');
    for (const e of top.edges) L.push(`- ${name(e.from)} → ${name(e.to)}: ${e.label || e.tech || e.rel} · ${e.rel} (${e.n})${e.drawn ? '' : ` — not drawn: ${e.why}`}`);
    for (const d of top.declared) L.push(`- ${name(d.from)} ${d.both ? '↔' : '→'} ${name(d.to)}: ${d.label || '(declared)'} — declared, no evidence`);
  }
  const states = Object.keys(lv).filter(k => k.startsWith('open:'));
  const openOf = r => { const s = new Set([r.id]); for (const n of nodes.values()) if (expandable(n) && n.root === r.id && n.id !== r.id && !n.collapsed) s.add(n.id); return s; };
  for (const r of roots.filter(expandable)) {
    const exp = states.length ? openOf(r) : defaultExpansion(ctx);
    if (!exp.has(r.id)) exp.add(r.id);
    const proj = project(ctx, exp);
    L.push('', `## ${title(r.id)}${r.phrase ? ` — ${r.phrase}` : ''}${r.note ? ` (${r.note})` : ''}`, '');
    const inside = [...proj.nodes.values()].filter(v => v.id !== r.id && (v.node.root === r.id));
    const walk = (parentId, depth) => {
      for (const v of inside.filter(v => v.parent === parentId)) {
        const n = v.node, pad = '  '.repeat(depth);
        if (v.kind === 'class') {
          const k = autoKeys(ctx, n.unit, n.keys);
          const u = model.units.get(n.unit);
          L.push(`${pad}- ${u.name} (${u.kind}, ${S(u.pkg)})${n.alias ? ' [alias]' : ''}${n.phrase ? ` — ${n.phrase}` : ''}. Fields: ${k.fields?.join(', ') || '—'}. Methods: ${k.methods?.join(', ') || '—'}`);
        } else if (v.kind === 'stack') {
          L.push(`${pad}- [group] ${(n.title || '').replace('{n}', v.count)}${n.phrase ? ` — ${n.phrase}` : ''}: ${v.units.slice(0, 20).map(u => model.units.get(u).name).join(', ')}${v.units.length > 20 ? ' …' : ''}`);
        } else if (v.kind === 'own') {
          L.push(`${pad}- [own classes] ${v.units.map(u => model.units.get(u).name).join(', ')}`);
        } else {
          L.push(`${pad}- ${v.open ? '[open] ' : ''}${n.kind} **${title(n.id)}**${n.phrase ? ` — ${n.phrase}` : ''}${v.open ? '' : ` (${v.count} classes)`}`);
          if (v.open) walk(n.id, depth + 1);
        }
      }
    };
    walk(r.id, 0);
    const own = proj.edges.filter(e => proj.nodes.get(e.from).node.root === r.id && proj.nodes.get(e.to).node.root === r.id);
    const drawn = own.filter(e => e.drawn), listed = own.filter(e => !e.drawn);
    if (drawn.length) { L.push('', 'Arrows drawn:'); for (const e of drawn) L.push(`- ${name(e.from)} → ${name(e.to)}: ${e.rel} · ${e.label || e.tech || ''}${e.tech && e.label && e.tech !== e.label ? ` (${e.tech})` : ''}`); }
    if (listed.length) L.push('', 'Not drawn (listed in the panel): ' + listed.map(e => `${name(e.from)} → ${name(e.to)} (${e.why})`).join('; '));
  }
  return L.join('\n') + '\n';
}
