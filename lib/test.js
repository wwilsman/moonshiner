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
    debug,
    timeout,
    parent,
    ...config
  }) {
    if (typeof fn !== 'function')
      [skip, fn] = [true];

    this.fn = fn;
    this.name = name;
    this.type = 'test';
    this.skip = !!(skip ?? parent?.skip);
    this.only = !!only;
    this.debug = !!debug;
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

    if (config.plugins != null)
      this.configure(config);
  }

  #running;
  #configuring;
  #plugins = [];
  #listeners = new Map();

  async configure(config) {
    let configuring = this.#configuring;
    let deferred = new DeferredPromise();
    this.#configuring = deferred;
    await configuring;

    if (typeof config === 'function')
      config = await config();

    for (let plugin of [].concat(this.#plugins, config.plugins))
      config = { ...config, ...(await plugin?.configure?.(config)) };

    if (config.debug != null)
      this.debug = !!config.debug;

    if (config.timeout != null)
      this.timeout = config.timeout;

    for (let plugin of config.plugins ?? []) {
      if (!plugin) continue;
      if (typeof plugin === 'function')
        plugin = { apply: plugin };
      this.#plugins.push(plugin);
      await plugin?.apply(this);
    }

    deferred.resolve();
  }

  hook(type, options, fn) {
    if (typeof fn !== 'function') [options, fn] = [fn, options];
    let hook = new TestHook({ ...options, type, fn, parent: this });
    if (type === 'before' && this.#running) hook.run(this.#running.args);
    this.hooks[type].push(hook);
    return hook;
  }

  test(name, options, fn) {
    if (typeof fn !== 'function') [options, fn] = [fn, options];
    let test = new Test({ ...options, name, fn, parent: this });
    if (this.#running) test.run(this.#running.args);
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

  on(event, listener) {
    let listeners = this.#listeners.get(event) ?? [];
    this.#listeners.set(event, listeners);
    listeners.push(listener);
    return this;
  }

  async emit(event, ...args) {
    let emitted = new Set();

    let trigger = async key => {
      for (let listener of this.#listeners.get(key ?? '*') ?? []) {
        if (!emitted.has(listener)) await listener(...(key ? args : [event, ...args]));
        emitted.add(listener);
      }

      let count = this.#listeners.get(key ?? '*')?.length ?? 0;
      return key ? count : (count + await trigger(event));
    };

    let pending = await trigger();
    while (emitted.size < pending) pending = await trigger();

    await this.parent?.emit(event, ...args);
  }

  async run({ context = {}, signal, ctx } = {}) {
    if (this.#running) return this.#running.deferred.promise;

    let isTestSuite = this.type === 'suite';
    let isTestHook = this.type === 'hook';

    if (!isTestHook && context.results?.has(this))
      return context.results.get(this);

    let results = { test: this, hooks: {}, children: [], start: Date.now() };
    (context.results ??= new Map()).set(this, results);
    let cleanup = context.cleanup ??= new Map();
    let abortController = new AbortController();
    let outerSignal = signal;
    let timeout;

    let abort = () => {
      if (!results.pass) results.error ??= outerSignal?.reason;
      abortController.abort(outerSignal?.reason);
    };

    signal = abortController.signal;
    context.controller ??= abortController;
    outerSignal?.addEventListener('abort', abort);

    if (!this.parent) {
      signal.addEventListener('abort', () => {
        this.emit('run:abort', outerSignal?.reason);
      });
    }

    this.#running = {
      args: { context, signal, ctx },
      deferred: new DeferredPromise(() => {
        this.#running = null;
      })
    };

    ctx ??= isTestSuite
      ? new TestSuiteContext(this, signal)
      : new TestContext(this, signal);

    if (!outerSignal && globalThis.process && !globalThis.process.send) {
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

    await this.#configuring;

    if (!this.parent)
      await this.emit('run:prepare');

    try {
      if (isTestSuite) await this.ready();

      if (!this.parent)
        await this.emit('run:start', { ...results });

      results.skip = !isTestSuite && !isTestHook &&
        (this.skip || (this.parent?.runOnly && !this.only));

      await this.emit('test:plan', { ...results });

      if (results.skip) {
        outerSignal?.removeEventListener('abort', abort);
        this.#running.deferred.resolve();
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
          await this.emit('test:before', { ...results });

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

            await this.emit('test:after', { ...results });

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

    await this.emit((
      results.pass ? 'test:pass' : 'test:fail'
    ), { ...results });

    if (!this.parent)
      await this.emit('run:end', { ...results });

    if (!this.parent && results.fail && globalThis.process)
      globalThis.process.exitCode = 1;

    if (!isTestHook && (!this.debug || this.parent)) {
      outerSignal?.removeEventListener('abort', abort);
      abortController.abort(results.error);
    }

    this.#running.deferred.resolve();
    return results;
  }
}

export class TestHook extends Test {
  constructor({ type, ...options }) {
    super({ name: `<${type}>`, ...options });
    this.hookType = type;
    this.type = 'hook';
  }
}
