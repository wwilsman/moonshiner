import createReporter from './base.js'

export function summarize(suite) {
  return [suite].reduce(function tally(sum, suite) {
    for (let test of suite.tests ?? []) {
      if (test.success) (sum.passing ??= []).push(test);
      if (test.error) (sum.failing ??= []).push(test);
      if (test.skip) (sum.skipped ??= []).push(test);
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

    for (let test of failing) {
      let name = [...test.path.slice(1), test.name].join(' / ');
      let err = test.error.stack ?? test.error.message ?? test.error;
      onError(`\n${name}\n${err}`);
    }
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
