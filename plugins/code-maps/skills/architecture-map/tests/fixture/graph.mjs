// A small graph in the extractor's own shape (see java-diagrams/scripts/Extract.java), hand-written
// so the tests need neither a JDK nor compiled classes. It holds the cases the projector must get
// right: a nested type with its own `implements`, an interface with six implementers (one through
// an abstract base), a two-way dependency, an Optional field, a List field, a pair named only in
// a signature, and an annotated class.
const R = 'acme';
const t = (id, kind, extra = {}) => ({ id: `${R}.${id}`, name: id.slice(id.lastIndexOf('.') + 1).replace(/\$/g, '.').split('.').pop(), pkg: `${R}.${id.slice(0, id.lastIndexOf('.'))}`, kind, vis: 'public', set: 'main', fields: [], methods: [], ...extra });
const f = (name, type, extra = {}) => ({ name, type, vis: 'private', ...extra });
const m = (name, params = '', type = 'void', extra = {}) => ({ name, params, type, vis: 'public', ...extra });
const e = (from, to, kinds, extra = {}) => ({ from: `${R}.${from}`, to: `${R}.${to}`, kinds, ...extra });

const plugins = ['A', 'B', 'C', 'D', 'E', 'F'];
export const graph = {
  meta: { extractor: 'fixture', jdk: 'none', roots: [{ path: '/fixture', set: 'main' }], types: 0 },
  types: [
    t('app.Main', 'class', { fields: [f('engine', 'Engine')], methods: [m('main', 'String[]', 'void', { static: true })], source: 'Main.java', line: 5 }),
    t('core.Engine', 'class', { fields: [f('plugins', 'List<Plugin>'), f('store', 'Store'), f('reporter', 'Optional<Reporter>')], methods: [m('run', 'Input', 'Result'), m('api', '', 'Api'), m('Engine', 'Store', undefined, { ctor: true })], source: 'Engine.java', line: 9 }),
    { ...t('core.Engine$Stats', 'class'), name: 'Stats', outer: `${R}.core.Engine`, vis: 'private', interfaces: [`${R}.core.Reporter`] },
    t('core.Plugin', 'interface', { methods: [m('apply', 'Input', 'Result', { abstract: true })] }),
    t('core.Reporter', 'interface', { methods: [m('report', '', 'String', { abstract: true })] }),
    t('core.Result', 'record', { fields: [f('value', 'String')], methods: [m('value', '', 'String')] }),
    t('core.Input', 'record', { fields: [f('text', 'String')], methods: [m('text', '', 'String')] }),
    t('core.Store', 'interface', { methods: [m('save', 'Result', 'void', { abstract: true })] }),
    t('io.FileStore', 'class', { interfaces: [`${R}.core.Store`], methods: [m('save', 'Result')] }),
    t('web.Api', 'class', { annotations: ['org.springframework.web.bind.annotation.RestController'], fields: [f('engine', 'Engine')], methods: [m('get', 'String', 'Result')] }),
    ...plugins.map(p => t(`plugins.${p}`, 'class', { interfaces: [`${R}.core.Plugin`], methods: [m('apply', 'Input', 'Result')] })),
    t('plugins.Base', 'class', { abstract: true, interfaces: [`${R}.core.Plugin`], methods: [m('apply', 'Input', 'Result'), m('helper', '', 'String', { vis: 'protected' })] }),
    t('plugins.G', 'class', { super: `${R}.plugins.Base`, methods: [m('apply', 'Input', 'Result')] }),
  ],
  edges: [
    e('app.Main', 'core.Engine', { field: { n: 1, via: ['engine'] }, calls: { n: 1, via: ['main→run'], line: 7 }, creates: { n: 1, line: 6 } }),
    e('core.Engine', 'core.Plugin', { field: { n: 1, via: ['plugins'] }, calls: { n: 2, via: ['run→apply'], line: 14 } }, { wrap: 'java.util.List' }),
    e('core.Engine', 'core.Store', { field: { n: 1, via: ['store'] }, calls: { n: 1, via: ['run→save'], line: 16 } }),
    e('core.Engine', 'core.Result', { creates: { n: 1, line: 15 }, return: { n: 1 } }),
    e('core.Engine', 'core.Input', { param: { n: 1 } }),
    e('core.Engine', 'core.Reporter', { field: { n: 1, via: ['reporter'] } }, { wrap: 'java.util.Optional' }),
    e('core.Engine$Stats', 'core.Reporter', { implements: { n: 1 } }),
    e('core.Engine', 'web.Api', { return: { n: 1 } }),
    e('web.Api', 'core.Engine', { field: { n: 1, via: ['engine'] }, calls: { n: 1, via: ['get→run'], line: 12 } }),
    e('io.FileStore', 'core.Store', { implements: { n: 1 } }),
    e('io.FileStore', 'core.Result', { param: { n: 1 } }),
    e('io.FileStore', 'core.Engine', { uses: { n: 1, line: 20 } }),
    ...plugins.flatMap(p => [
      e(`plugins.${p}`, 'core.Plugin', { implements: { n: 1 } }),
      e(`plugins.${p}`, 'core.Result', { creates: { n: 1, line: 4 }, return: { n: 1 } }),
      e(`plugins.${p}`, 'core.Input', { param: { n: 1 } }),
    ]),
    e('plugins.Base', 'core.Plugin', { implements: { n: 1 } }),
    e('plugins.Base', 'core.Input', { param: { n: 1 } }),
    e('plugins.Base', 'core.Result', { return: { n: 1 } }),
    e('plugins.G', 'plugins.Base', { extends: { n: 1 } }),
    e('plugins.G', 'core.Result', { creates: { n: 1, line: 4 }, return: { n: 1 } }),
    e('plugins.G', 'core.Input', { param: { n: 1 } }),
  ],
};
graph.meta.types = graph.types.length;
