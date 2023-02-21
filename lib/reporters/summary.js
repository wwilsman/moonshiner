import createReporter from './base.js';
import { indent } from '../utils.js';

export function summarize(suite) {
  return [suite].reduce(function tally(sum, suite) {
    for (let test of suite.tests ?? []) {
      if (test.success) (sum.passing ??= []).push(test);
      else if (test.error) (sum.failing ??= []).push(test);
      else (sum.skipped ??= []).push(test);
    }

    return (suite.suites ?? []).reduce(tally, sum);
  }, {});
}

export function printSummary(suite, {
  onInfo = (...a) => console.log(...a),
  onError = (...a) => console.error(...a.map(
    error => error.stack ?? error.message ?? error))
} = {}) {
  let { passing, failing, skipped } = summarize(suite);

  if (failing) {
    onInfo('\nFailed:');

    for (let test of failing) onError('\n' + [
      indent(1, ([...test.path, test.name].filter(Boolean).join(' / '))),
      indent(2, [test.error.name, test.error.message].join(': ')),
      indent(3, (test.error.stack ?? []).map(stack => [
        'at' + (stack.function ? ` ${stack.function}` : ''),
        (stack.file ? ` (${stack.file}:${stack.line}:${stack.col})` : '')
      ].join('')).join('\n'))
    ].filter(Boolean).join('\n'));
  }

  onInfo('\n' + [
    `Passing: ${passing?.length ?? 0}`,
    `Failing: ${failing?.length ?? 0}`,
    `Skipped: ${skipped?.length ?? 0}`
  ].join('; ') + '\n');
}

export function reporter(options) {
  return createReporter({
    'suite:after': ({ data: { depth, ...suite } }) =>
      depth === 0 && printSummary(suite, options)
  });
}

export default reporter;
