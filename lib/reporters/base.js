import deferred from '../utils/deferred.js';

function buildReportTable(event, merge) {
  if (!event.client?.name || !event.data) return;

  let collect = (accum, suite, add) => {
    add(accum, suite);

    let hasOnly = suite.only && (
      suite.tests?.some(t => t.only) ||
      suite.suites?.some(s => s.only));

    for (let test of suite.tests ?? [])
      if (!hasOnly || test.only) add(accum, test);

    for (let inner of suite.suites ?? [])
      if (!hasOnly || inner.only) collect(accum, inner, add);

    return accum;
  };

  let ids = collect(new Set(), event.data, (s, { id }) => s.add(id));
  let data = merge ? mergeReports([merge.get('.').meta, event.data]) : event.data;

  let reports = collect(new Map(), data, (reports, meta) => {
    let entry = merge?.get(meta.id) ?? { reports: {} };
    if (ids.has(meta.id)) entry.reports[event.client.name] = {};
    reports.set(meta.id, entry);
    entry.meta = meta;

    entry.pending ??= ['before', 'after'].reduce((r, h) => Object.assign(r, {
      [`${h}:${meta.depth != null ? 'suite' : 'test'}`]: deferred()
    }), {});
  });

  return reports;
}

function mergeReports(reports) {
  let mergeLists = lists => lists.reduce((arr, item) => {
    let index = arr.findIndex(i => i?.id === item?.id);
    if (~index) arr.splice(index, 1, mergeReports([arr[index], item]));
    else arr.push({ ...item });
    return arr;
  }, []);

  return reports?.reduce((result, data) => {
    if (!data) return result;
    let { suite, passing, ...attrs } = data;

    if (suite && typeof suite !== 'string')
      result.suite = mergeReports([result.suite, suite]);
    if (passing === false) result.passing = false;
    if (passing) result.passing ??= passing;

    for (let k in attrs) {
      if (Array.isArray(attrs[k]) && typeof attrs[k][0] === 'object')
        result[k] = mergeLists([result[k] ?? [], attrs[k] ?? []].flat());
      else result[k] = attrs[k];
    }

    return result;
  }, {});
}

function getReport(id, name, table, merge) {
  if (!id || !name || !table) return;
  let { reports, meta, pending } = table.get(id);
  let report = { meta, pending: pending[name] };
  if (!report.pending) return;

  let data = Object.values(reports).map(r => r[name]);
  if (merge || data.every(Boolean)) report.data = mergeReports(data);
  if (typeof report.data?.suite === 'string') report.data.suite = (
    getReport(report.data.suite, name, table, merge));

  report.clients = Object.keys(reports);
  return report;
}

function updateReportTable({ type, name, data, client }, table) {
  if (type !== 'report' || !table || !client?.name || !data?.id) return;
  table.get(data.id).reports[client.name][name] = data;
  return getReport(data.id, name, table);
}

function syncReport(event, table, callback) {
  let report = updateReportTable(event, table);
  if (!report) return callback(event.data);
  if (!report.data) return;
  let last;

  if (event.name.startsWith('before:')) {
    let ids = Array.from(table.keys());
    let id = ids[ids.indexOf(report.meta.id) - 1];
    last = getReport(id, 'after:test', table, true);
    last ??= getReport(id, 'before:suite', table, true);
  } else if (event.name === 'after:test') {
    last = getReport(report.meta.id, 'before:test', table, true);
  } else if (event.name === 'after:suite' && report.meta.suites) {
    let id = report.meta.suites.findLast(s => table.has(s.id))?.id;
    last = getReport(id, 'after:suite', table, true);
  } else if (event.name === 'after:suite' && report.meta.tests) {
    let id = report.meta.tests.findLast(t => table.has(t.id))?.id;
    last = getReport(id, 'after:test', table, true);
  }

  last?.pending.promise.then(report.pending.resolve);
  if (!last) report?.pending.resolve();

  return report.pending.promise.then(() => {
    return callback(report.data);
  });
}

export function createReporter(handler, state = {}) {
  let clientReports;

  return function reporter(event, next) {
    let handle = (type, name, data) => {
      let evt = { ...event, type, name, data };
      let end = name === 'after:suite' && !data.depth;

      if (end) clientReports = null;
      if (end && !data?.success && globalThis?.process)
        globalThis.process.exitCode ??= 1;
      if (typeof handler === 'function')
        return (handler.call(this, evt), data);
      if (type === 'console' && !name.startsWith(type))
        name = evt.name = `${type}:${name}`;

      handler[name]?.call(this, data, state, evt);
      return data;
    };

    if (event.type === 'use' && typeof state === 'function')
      state = state(this);

    if (event.type === 'client' && event.name === 'ready')
      clientReports = buildReportTable(event, clientReports);

    if (event.type === 'console')
      handle(event.type, event.name, event.data);

    if (event.type === 'report')
      return syncReport(event, clientReports, data => Promise.resolve()
        .then(() => event.name.startsWith('after:') && next())
        .then(() => handle(event.type, event.name, data))
        .then(() => event.name.startsWith('before:') && next()));

    if (event.type === 'run')
      return Promise.resolve()
        .then(() => handle('report', `before:${event.name}`, event.data))
        .then(() => next())
        .then(result => handle('report', `after:${event.name}`, result));

    return next();
  };
}

export default createReporter;
