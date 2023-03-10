import log from 'moonshiner/logger';
import createReporter from './base.js';
import { indent } from '../utils.js';

function findErrorSource(suite, src = suite) {
  let hook = src.type === 'suite' ? 'All' : 'Each';
  let id = src.error.source;

  src.error.source &&= id === src.id ? src : (
    suite[`before${hook}s`]?.find(h => h.id === id) ??
    suite[`after${hook}s`]?.find(h => h.id === id)
  ) ?? id;

  return src.error;
}

export function summarize(suite) {
  return [suite].reduce(function tally(sum, suite) {
    if (suite.error)
      (sum.errors ??= []).push(findErrorSource(suite))

    for (let test of suite.tests ?? []) {
      if (test.error) (sum.errors ??= []).push(findErrorSource(suite, test));
      let result = test.error ? 'failing' : test.success ? 'passing' : 'skipped';
      (sum[result] ??= []).push(test);
    }

    return (suite.suites ?? []).reduce(tally, sum);
  }, {});
}

export function printSummary(suite, { write = log.write } = {}) {
  let { passing, failing, skipped, errors } = summarize(suite);
  write('\n')

  if (errors) {
    write('Errors:\n\n', 'error');

    for (let { source, ...error } of errors) {
      write(indent(1, [...source.path, source.name].filter(Boolean).join(' | ')) + '\n');
      write(indent(2, `${error.name}: ${error.message}`) + '\n', 'error');
      if (error.stack?.length) write(indent(3, error.stack.map(stack => (
        'at' + (stack.function ? ` ${stack.function}` : '') +
        (stack.file ? ` (${stack.file}:${stack.line}:${stack.col})` : '')
      )).join('\n')) + '\n\n', 'error');
    }
  }

  write(
    `Passing: ${passing?.length ?? 0} | ` +
    `Failing: ${failing?.length ?? 0} | ` +
    `Skipped: ${skipped?.length ?? 0}` +
    '\n\n'
  );
}

export function reporter(options) {
  return createReporter({
    'suite:after': ({ data: { depth, ...suite } }) =>
      depth === 0 && printSummary(suite, options)
  });
}

export default reporter;
