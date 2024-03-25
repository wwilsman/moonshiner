import {
  TestContext,
  TestSuiteContext
} from './context.js';
import {
  DeferredPromise
} from './util/promise.js';

export class Test {
  constructor({
    name,
    fn,
    skip,
    only,
    timeout,
    parent
  }) {
    if (typeof fn !== 'function')
      [skip, fn] = [true];

    this.fn = fn;
    this.name = name;
    this.type = 'test';
    this.skip = !!(skip ?? parent?.skip);
    this.only = !!only;
    this.runOnly = this.only;
    this.children = [];
    this.parent = parent;
    this.depth = (parent?.depth ?? -1) + 1;
    this.index = parent?.children?.length ?? 0;
    this.hooks = { before: [], after: [] };
    this.hooks.beforeEach = parent?.hooks.beforeEach.slice() ?? [];
    this.hooks.afterEach = parent?.hooks.afterEach.slice() ?? [];

    let id = parent ? `${parent.id} | ${name}` : name;
    let unique = parent?.children.filter(child => {
      return `${parent.id} | ${child.name}` === id;
    }).length ?? 0;

    this.id = (id && unique)
      ? `${id} (${unique + 1})`
      : (id ?? `${unique}`);

    Object.defineProperty(this, 'timeout', {
      get: () => timeout ?? parent?.timeout ?? 2000,
      set: ms => ms && (timeout = ms)
    });
  }

  #autorun;
  #reporters = [];
  #coverageVariable = '__coverage__';

  configure(config) {
    if (config.debug != null)
      this.debug = !!config.debug;

    if (config.timeout != null)
      this.timeout = config.timeout;

    if (config.coverage?.variable)
      this.#coverageVariable = config.coverage.variable;
    if (config.coverage?.data)
      globalThis[this.#coverageVariable] = config.coverage.data;

    if (config.autorun != null) {
      clearTimeout(this.#autorun);
      this.#autorun = !config.autorun ? null : (
        setTimeout(() => this.run(), config.autorun));
    }

    if (config.reporter || config.reporters) {
      this.#reporters = [].concat(
        config.reporter, config.reporters
      ).filter(Boolean);
    }
  }

  hook(type, options, fn) {
    if (typeof fn !== 'function') [options, fn] = [fn, options];
    let hook = new TestHook({ ...options, type, fn, parent: this });
    this.hooks[type].push(hook);
    return hook;
  }

  test(name, options, fn) {
    if (typeof fn !== 'function') [options, fn] = [fn, options];
    let test = new Test({ ...options, name, fn, parent: this });
    this.children.push(test);
    return test;
  }

  lookup(id) {
    if (!id) return;
    if (id === this.id) return this;
    for (let child of this.children) {
      let found = child.lookup(id);
      if (found) return found;
    }
  }

  #connections = new Map();

  connectRemoteTest(connection, { id }) {
    if (this.#connections.has(connection)) return;
    this.#connections.set(connection, new DeferredPromise());

    connection.on('test:pass', ({ test }) => {
      if (test?.id !== id) return;
      this.#connections.get(connection)?.resolve();
      return DeferredPromise.all(this.#connections);
    });

    connection.on('test:fail', ({ test, error }) => {
      if (test?.id !== id) return;
      if (error && !(error instanceof Error))
        error = Object.assign(new Error(), error);
      this.#connections.get(connection)?.reject(error);
      return DeferredPromise.all(this.#connections);
    });

    connection.on('close', () => {
      this.#connections.delete(connection);
    });
  }

  async run({ context = {}, signal, ctx } = {}) {
    let results = { test: this, hooks: {}, children: [], start: Date.now() };
    (context.results ??= new Map()).set(this, results);
    clearTimeout(this.#autorun);

    let report = context.report ??= this.#reporter();
    let cleanup = context.cleanup ??= new Map();
    let isTestSuite = this.type === 'suite';
    let isTestHook = this.type === 'hook';
    let timeout;

    let outerSignal = signal;
    let abortController = new AbortController();

    let abort = () => {
      if (!results.pass) results.error ??= outerSignal?.reason;
      abortController.abort(outerSignal?.reason);
    };

    signal = abortController.signal;
    context.controller ??= abortController;
    outerSignal?.addEventListener('abort', abort);

    ctx ??= isTestSuite
      ? new TestSuiteContext(this, signal)
      : new TestContext(this, context, signal);

    if (!this.isRemoteTest && !outerSignal) {
      globalThis.process?.on('SIGTERM', abort);
      globalThis.process?.on('SIGINT', abort);
    }

    let runHooks = async type => {
      let hooks = this.hooks[type];
      if (!hooks?.length || isTestHook) return;

      for (let hook of hooks) {
        let { error } = await hook.run({ context, signal, ctx });
        if (error && type.startsWith('before')) throw error;
      }
    };

    let collectResults = tests => tests.reduce((all, test) => {
      let res = context.results.get(test);
      if (res?.fail) results.fail = true;
      if (res) all.push(res);
      return all;
    }, []);

    let collectTotals = () => results.children.reduce((totals, res) => ({
      passing: totals.passing + (res.total?.passing ?? 0),
      failing: totals.failing + (res.total?.failing ?? 0),
      skipped: totals.skipped + (res.total?.skipped ?? (
        (results.skip && res.test.type === 'test') ? 1 : 0))
    }), {
      passing: (results.pass && this.type === 'test') ? 1 : 0,
      failing: (results.fail && this.type === 'test') ? 1 : 0,
      skipped: (results.skip && this.type === 'test') ? 1 : 0
    });

    try {
      if (!this.parent)
        await report('run:start', { ...results });

      if (isTestSuite) await this.ready();

      results.skip = !isTestSuite && !isTestHook &&
        (this.skip || (this.parent?.runOnly && !this.only));

      await report('test:plan', { ...results });

      if (results.skip) {
        outerSignal?.removeEventListener('abort', abort);
        results.total = collectTotals();
        return results;
      }

      if (isTestSuite) {
        let parents = [this.parent].reduce(function reduce(parents, p) {
          return !p?.parent ? parents : reduce([...parents, p.parent], p.parent);
        }, []);

        for (let [t, cleanup] of Array.from(context.cleanup.entries()).reverse())
          if (!parents.includes(t.parent)) await cleanup();
      }

      await runHooks('before');

      try {
        if (isTestSuite) {
          await this.ready();

          for (let child of this.children) {
            await child.run({ context, signal });
            if (signal.reason) break;
          }
        } else {
          await runHooks('beforeEach');

          try {
            let result = await Promise.race([
              Promise.resolve().then(async () => {
                await context.cleanup?.get(this)?.();

                if (!isTestSuite && this.fn?.length === 2) {
                  await new Promise((resolve, reject) => {
                    this.fn?.call(ctx, ctx, e => e ? reject(e) : resolve());
                  });
                } else {
                  return this.fn?.call(ctx, ctx);
                }
              }),

              new Promise((_, reject) => {
                if (signal.reason) return reject(signal.reason);
                signal.addEventListener('abort', () => reject(signal.reason));

                let startTimeout = ms =>
                  timeout = ms ? setTimeout(reject, ms, (
                    new Error(`timed out after ${ms}ms`)
                  )) : null;

                ctx.timeout = ms => {
                  clearTimeout(timeout);
                  startTimeout(this.timeout = ms);
                };

                startTimeout(this.timeout);
              })
            ]);

            if (isTestHook && typeof result === 'function' && (
              this.hookType === 'before' || this.hookType === 'beforeEach'
            )) cleanup.set(this, () => (cleanup.delete(this), result()));
          } finally {
            clearTimeout(timeout);
            await runHooks('afterEach');
          }
        }
      } finally {
        await runHooks('after');
        await DeferredPromise.all(this.#connections);
      }
    } catch (error) {
      if (error.name === 'AbortError')
        context.controller.abort(error);
      results.error = error;
    }

    results.end = Date.now();
    results.duration = results.end - results.start;
    results.hooks.before = collectResults(this.hooks.before);
    results.hooks.beforeEach = collectResults(this.hooks.beforeEach);
    results.hooks.afterEach = collectResults(this.hooks.afterEach);
    results.hooks.after = collectResults(this.hooks.after);
    results.children = collectResults(this.children);
    results.fail ??= !!results.error;
    results.pass = !results.fail;
    results.total = collectTotals();

    await report(results.pass ? 'test:pass' : 'test:fail', { ...results });

    if (!this.parent) {
      if (globalThis[this.#coverageVariable])
        results.coverage = globalThis[this.#coverageVariable];
      await report('run:end', { ...results });
    }

    if (!isTestHook && (!this.debug || this.parent)) {
      outerSignal?.removeEventListener('abort', abort);
      abortController.abort(results.error);
    }

    return results;
  }

  #reporter() {
    return this.#reporters.reduce((last, reporter) => {
      let next = () => {};
      let events = [];
      let stop;

      Promise.resolve().then(async () => {
        let result, report = reporter(async function* source() {
          while (true) {
            if (events.length) {
              let { resolve, event } = events.shift();
              resolve(yield event);
            } else if (!stop) {
              await new Promise(resolve => (next = resolve));
            } else {
              return;
            }
          }
        }());

        while (!result?.done)
          result = await report.next(result?.value);
      });

      return (...args) => last(...args).then(event => {
        return new Promise(resolve => {
          if (event.type === 'run:end') stop = true;
          events.push({ resolve, event });
          next();
        });
      });
    }, (type, data) => (
      Promise.resolve({ type, data })
    ));
  }
}

export class TestHook extends Test {
  constructor({ type, ...options }) {
    super({ name: `<${type}>`, ...options });
    this.hookType = type;
    this.type = 'hook';
  }
}
