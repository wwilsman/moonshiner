import { createTestHook, parseError } from './utils.js';

function runWithin(fn, timeout) {
  if (!timeout) return fn();

  let resolve, reject, deferred = new Promise((...a) => ([resolve, reject] = a));
  let error = new Error(`Timeout exceeded (${timeout}ms)`);
  let timer = setTimeout(reject, timeout, error);

  Promise.resolve().then(fn).then(resolve, reject);
  return deferred.finally(() => clearTimeout(timer));
}

function createRunnable({ ...runnable }, run) {
  if (!run) runnable.skip = true;
  runnable.success = null;
  runnable.index ??= 0;
  runnable.path ??= [];

  runnable._timeout = runnable.timeout;
  runnable.timeout = ms => ms ? (runnable._timeout = ms)
    : runnable._timeout ?? rollup(runnable, '_timeout').at(-1) ?? 2000;

  runnable.run = async () => {
    try {
      let timeout = !runnable.describe && runnable.timeout();
      await runWithin(() => run(runnable), timeout);
      runnable.success ??= true;
    } catch (error) {
      // @todo: better top level errors
      if (!runnable.suite) console.error(error);
      runnable.error = parseError(error);
      runnable.success = false;
    }

    return runnable;
  };

  return runnable;
}

function ref(subject, swap) {
  let ref = subject.ref ??= swap?.ref ?? { current: subject };
  return swap ? (ref.current = subject) : ref.current;
}

function rollup(suite, map = i => i) {
  let suites = [suite];

  if (typeof map === 'string')
    map = (k => o => o?.[k])(map);

  while (suites[0]?.suite)
    suites.unshift(suites[0].suite);

  return suites.reduce((result, suite) => {
    let val = map(suite);
    if (val != null) result.push(val);
    return result;
  }, []);
}

function hasOnly({ only, tests, suites } = {}) {
  return only || (
    !!(tests?.length && tests.some(hasOnly)) ||
    !!(suites?.length && suites.some(hasOnly))
  );
}

function runTestSuite(suite) {
  return suite.emit('run', 'suite', suite, async suite => {
    let runAll = async (runnables = []) => {
      for (let runnable of runnables) {
        if (!runnable.skip) await runnable.run();
        if (runnable.error) throw runnable.error;
      }
    };

    if (!suite.skip) await runAll(suite.beforeAlls);

    let beforeEachs = rollup(suite, 'beforeEachs').flat();
    let afterEachs = rollup(suite, 'afterEachs').flat();

    for (let test of suite.tests ?? []) {
      if (suite.only && !test.only) continue;
      if (!test.skip && suite.skip) test.skip = true;

      await suite.emit('run', 'test', test, async test => {
        let stack = [...beforeEachs, test, ...afterEachs];
        await runAll(stack).catch(() => (suite.success = false));
        return test;
      });
    }

    for (let inner of suite.suites ?? []) {
      if (suite.only && !hasOnly(inner)) continue;
      if (!(await inner.run()).success) suite.success = false;
    }

    if (!suite.skip) await runAll(suite.afterAlls);
    suite.success ??= true;
    return suite;
  });
}

export function createTestRunner(options) {
  let runner = createRunnable({
    depth: (options?.suite?.depth ?? -1) + 1,
    ...options,

    emit: (type, name, data, next) => {
      let event = typeof type !== 'string' ? { ...type } : { type, name };
      if (typeof name === 'function') next = name;

      return rollup(runner, 'middlewares').flat().reduceRight((nxt, mdw) => (
        data => mdw.call(runner, { ...event, data }, d => nxt(d ?? data))
      ), next)(data ?? event.data);
    }
  }, runTestSuite);

  let pusher = key => (name, callback, opts) => {
    if (typeof name === 'function') [name, callback, opts] = [key, name, callback];
    if (typeof opts === 'function') [callback, opts] = [opts, callback];

    let suite = ref(runner);
    opts = { suite, name, ...opts };
    opts.index = suite[`${key}s`]?.length ?? 0;
    opts.path = [...suite.path, suite.name ?? ''];
    if (opts.only) rollup(suite, s => (s.only = true));

    if (key === 'beforeEach')
      callback = createTestHook(callback);

    let subject = key === 'suite'
      ? createTestRunner(opts)
      : createRunnable(opts, callback);

    return suite.emit('describe', key, subject, result => {
      (ref(runner)[`${key}s`] ??= []).push(result);

      if (key === 'suite') {
        let current = ref(runner);
        callback(ref(result, runner));
        ref(current, runner);
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
    timeout: ms => ms ? (ref(runner)._timeout = ms) : ref(runner)._timeout,
    use: (...fns) => fns.map(fn => (
      fn.call(ref(runner), { type: 'use', data: fn },
        f => (ref(runner).middlewares ??= []).push(f ?? fn)
      )))
  });
}

export default createTestRunner;
