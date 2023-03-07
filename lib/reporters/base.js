import deferred from '../utils/deferred.js';

function buildReportTable(event, merge) {
  if (!event.client?.name || !event.data) return;

  let collect = (suite, reports = new Map()) => {
    let entry = { reports: {}, pending: deferred() };
    (entry.reports ??= {})[event.client.name] = {};
    reports.set(suite.id, entry);

    let hasOnly = suite.only && (
      suite.tests?.some(t => t.only) ||
      suite.suites?.some(s => s.only));

    for (let test of suite.tests ?? []) {
      if (hasOnly && !test.only) continue;
      let entry = { pending: deferred() };
      (entry.reports ??= {})[event.client.name] = {};
      reports.set(test.id, entry);
    }

    for (let inner of suite.suites ?? []) {
      if (hasOnly && !inner.only) continue;
      collect(inner, reports);
    }

    return reports;
  }

  let reports = collect(event.data);
  return mergeTables(merge, reports);
}

function mergeTables(target, source) {
  if (!target || !source) return target || source;
  let existing = Array.from(target.entries());
  let entries = Array.from(source.entries());
  let last = target.size;

  return new Map(entries.reduce((t, [id, data]) => {
    let i = t.findIndex(([i]) => i === id);
    if (i === -1) t.splice(last, 0, [id, data]);
    else Object.assign(t[i][1].reports, data.reports);
    return (last = i, t);
  }, existing));
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
  let { reports, ...report } = table.get(id);
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

  let ids = Array.from(table.keys());
  let last = ids[ids.indexOf(report.data.id) - 1];
  last &&= getReport(last, event.name, table, true);
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
