import { createTestHook } from './utils.js';

function createRunnable(options, run) {
  let runnable = { ...options };
  if (!run) runnable.skip = true;

  let timeout = options.timeout;
  runnable.timeout = ms => ms ? (timeout = ms) : timeout;

  runnable.run = async () => {
    try {
      // @todo: timeout
      await run(runnable);
      runnable.success = true;
    } catch (error) {
      // @todo: better top level errors
      if (!runnable.suite) console.error(error);
      runnable.error = error;
    }
  };

  return runnable;
}

function ref(subject, swap) {
  let ref = subject.ref ??= swap?.ref ?? { _: subject };
  return swap ? (ref._ = subject) : ref._;
}

function createTestSuite(runner) {
  let pusher = key => (name, callback, opts) => {
    if (typeof name === 'function') [name, callback, opts] = [key, name, callback];
    if (typeof opts === 'function') [callback, opts] = [opts, callback];
    opts = { suite: ref(runner), name, ...opts };

    if (key === 'beforeEach')
      callback = createTestHook(callback);

    let subject = key === 'suite'
      ? createTestRunner(opts)
      : createRunnable(opts, callback);

    return ref(runner).emit('describe', key, subject, result => {
      (ref(runner)[`${key}s`] ??= []).push(result);

      if (key === 'suite') {
        callback(ref(result, runner));
        ref(runner, result);
      }

      return result;
    });
  };

  let configurable = fn => Object.assign(fn, {
    skip: (n, f, o) => fn(n, f, { ...o, skip: true }),
    only: (n, f, o) => fn(n, f, { ...o, only: true })
  });

  return Object.assign(runner, {
    beforeAll: pusher('beforeAll'),
    beforeEach: pusher('beforeEach'),
    afterAll: pusher('afterAll'),
    afterEach: pusher('afterEach'),
    it: configurable(pusher('test')),
    xit: (...a) => runner.it.skip(...a),
    fit: (...a) => runner.it.only(...a),
    describe: configurable(pusher('suite')),
    xdescribe: (...a) => runner.describe.skip(...a),
    fdescribe: (...a) => runner.describe.only(...a),
    use: (...fns) => fns.map(fn => (
      fn.call(ref(runner), { type: 'use', data: fn }, (
        f => (ref(runner).middlewares ??= []).push(f ?? fn))
      )))
  });
}

function rollup(suite, map = i => i) {
  let suites = [suite];

  if (typeof map === 'string')
    map = (k => o => o?.[k])(map);

  while (suites[0]?.suite)
    suites.unshift(suites[0].suite);

  return suites.reduce((result, suite) => {
    let val = map(suite);
    if (val) result.push(val);
    return result;
  }, []);
}

function hasOnly({ tests, suites }) {
  return (
    !!(tests?.length && tests.some(t => t.only)) ||
    !!(suites?.length && suites.some(s => s.only || hasOnly(s)))
  );
}

function runTestSuite(suite) {
  return suite.emit('run', 'suite', suite, async suite => {
    let runAll = async (runnables = []) => {
      for (let runnable of runnables) {
        if (!runnable.skip) await runnable.run();
        if (runnable.error) return;
      }
    };

    if (!suite.skip) await runAll(suite.beforeAlls);

    let skipTests = suite.skip || hasOnly(suite);
    let beforeEachs = rollup(suite, 'beforeEachs').flat();
    let afterEachs = rollup(suite, 'afterEachs').flat();

    for (let test of suite.tests ?? []) {
      if (!test.skip && !test.only && skipTests) test.skip = true;

      await suite.emit('run', 'test', test, async test => {
        await runAll([...beforeEachs, test, ...afterEachs]);
        return test;
      });
    }

    for (let inner of suite.suites ?? []) await inner.run();
    if (!suite.skip) await runAll(suite.afterAlls);
    return suite;
  });
}

export function createTestRunner(middleware, options) {
  if (typeof middleware !== 'function' || typeof options === 'function')
    [middleware, options] = [options, middleware];

  let suite = { depth: (options?.suite?.depth ?? -1) + 1, ...options };
  if (middleware) (suite.middlewares ??= []).push(middleware);

  let emit = (type, name, data, next) =>
    rollup(suite, 'middlewares').flat().reduceRight((nxt, mdw) => (
      data => mdw.call(runner, { type, name, data }, d => nxt(d ?? data))
    ), next)(data);

  let runner = createRunnable({ ...suite, emit }, runTestSuite);
  return emit('context', 'new', runner, createTestSuite);
}

export default createTestRunner;
