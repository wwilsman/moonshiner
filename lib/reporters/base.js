function buildReportTable({ data, client }, table = {}, visited = new Set()) {
  if (!client.name || !data || visited.has(data)) return table;
  visited.add(data);

  if (data.path) {
    let id = [...data.path, data.index].join(' / ');
    (table[id] ??= {})[client.name] = {};
  }

  for (let value of Object.values(data))
    buildReportTable({ data: value, client }, table, visited);

  return table;
}

function updateReportTable({ type, name, data, client }, table) {
  if (type !== 'report' || !table || !client?.name || !data.path) return;
  let id = [...data.path, data.index].join(' / ');

  table[id][client.name][name] = data;
  return Object.values(table[id]).map(c => c[name]);
}

function mergeReports(reports) {
  return reports.reduce((result, data) => {
    if (!result || !data) return;
    let { suite, passing, ...attrs } = data;
    if (suite) result.suite = mergeReports([result.suite, suite]);
    if (passing === false) result.passing = false;
    if (passing) result.passing ??= passing;
    return Object.assign(result, attrs);
  }, {});
}

export function createReporter(handler, state = {}) {
  let clientReports;

  return function reporter(event, next) {
    let handle = (type, name, data) => {
      let evt = { ...event, type, name, data };
      if (typeof handler === 'function') handler.call(this, evt);
      else handler[name]?.call(this, data, state, evt);
      return data;
    };

    if (event.type === 'use' && typeof state === 'function')
      state = state(this);

    if (event.type === 'client' && event.name === 'ready')
      clientReports = buildReportTable(event, clientReports);

    if (event.type === 'console' || event.type === 'report') {
      let reports = updateReportTable(event, clientReports);

      if (event.name === 'after:suite' && globalThis?.process)
        globalThis.process.exitCode ??= 1;

      if (!reports || reports?.every(Boolean)) return Promise.resolve()
        .then(() => event.name.startsWith('after:') && next())
        .then(() => handle(event.type, event.name, mergeReports(reports) ?? event.data))
        .then(() => event.name.startsWith('before:') && next());
    }

    if (event.type === 'run') return Promise.resolve()
      .then(() => handle('report', `before:${event.name}`, event.data))
      .then(() => next())
      .then(result => handle('report', `after:${event.name}`, result));

    return next();
  };
}

export default createReporter;
