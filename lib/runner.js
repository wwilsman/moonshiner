import { TestContext } from './context.js';

export class TestRunner {
  static #runners = new Map();

  static resolve(test) {
    while (test.parent) test = test.parent;
    let runner = this.#runners.get(test) ?? new TestRunner();
    this.#runners.set(test, runner);
    return runner;
  }

  #tests = new Map();
  #cleanup = new Map();

  run(test, options) {
    if (test.parent && !this.#tests.has(test.parent)) return;
    if (test.type !== 'hook' && this.#tests.has(test)) return this.#tests.get(test).promise;
    if (test.type !== 'hook' && test.parent?.isolated && !test.only && !test.isolated) return;

    let { signal, context } = this.#tests.get(test.parent) ?? options ?? {};
    if (test.type !== 'hook') context = new TestContext(test, signal, context);

    let timing = { start: performance.timeOrigin + performance.now() };
    let info = { test, timing, hooks: {}, children: [] };
    let meta = { info, context };
    let abort;

    meta.controller = new AbortController();
    meta.signal = info.signal = meta.controller.signal;

    signal?.addEventListener('abort', abort = () => {
      meta.controller.abort(signal?.reason);
    });

    meta.signal.addEventListener('abort', () => {
      if (!info.pass && !info.fail) info.aborted = meta.signal.reason;
      test.trigger('test:abort', info);
    });

    meta.promise = this.#runTest(test, meta).finally(() => {
      signal?.removeEventListener('abort', abort);
    });

    this.#tests.set(test, meta);
    return meta.promise;
  }

  abort(test, reason) {
    let meta = this.#tests.get(test);
    if (!meta || meta.signal.aborted) return;
    reason ??= 'test aborted';

    meta.controller.abort(typeof reason === 'string'
      ? Object.assign(new Error(reason), { name: 'AbortError' })
      : reason);
  }

  async #runTest(test, { info, controller }) {
    try {
      await test.configure();
      if (!test.depth) await test.trigger('test:prepare', info);
      if (test.type === 'suite') await test.ready();
      if (!test.depth) await test.trigger('test:start', info);
      await test.trigger('test:ready', info);

      if (test.type === 'test' && test.skip) {
        info = this.#collectResults(test, info);
        await test.trigger('test:skip', info);
        return info;
      }

      try {
        if (test.type === 'suite') await this.#runCleanup(test);
        await this.#runHooks(test, 'before');

        if (test.type === 'suite') {
          await test.ready();

          for (let child of test.children) {
            if (controller.signal.aborted) break;
            await this.run(child);
          }
        } else {
          try {
            await this.#cleanup.get(test)?.();
            await this.#runHooks(test, 'beforeEach');
            await test.trigger('test:before', info);

            let result = await this.#raceTimeout(test);

            if (test.hookType?.startsWith('before') && typeof result === 'function') {
              this.#cleanup.set(test, () => {
                this.#cleanup.delete(test);
                return result();
              });
            }
          } finally {
            try {
              await test.trigger('test:after', info);
            } finally {
              await this.#runHooks(test, 'afterEach');
            }
          }
        }
      } finally {
        await this.#runHooks(test, 'after');
      }
    } catch (error) {
      if (error.name === 'AbortError') controller.abort(error);
      info.error = error;
    }

    try {
      info = this.#collectResults(test, info);
      await test.trigger(info.pass ? 'test:pass' : 'test:fail', info);
      if (!test.depth) await test.trigger('test:end', info);
    } catch (error) {
      info.error ??= error;
    }

    return info;
  }

  async #runCleanup(test) {
    let cleanup = Array.from(this.#cleanup.entries());

    for (let [hook, fn] of cleanup.reverse()) {
      if (hook.parent !== test.parent) await fn();
      else break;
    }
  }

  async #runHooks(test, hookType) {
    if (test.type === 'hook') return;

    for (let hook of test.hooks[hookType]) {
      let { error } = await this.run(hook);
      if (error && hookType.startsWith('before')) throw error;
    }
  }

  async #raceTimeout(test) {
    let { context, signal } = this.#tests.get(test);
    let timeout;

    return new Promise((resolve, reject) => {
      let done = e => e ? reject(e) : resolve();
      let abort = () => reject(signal.reason);

      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort);

      let startTimeout = ms => {
        if (timeout) clearTimeout(timeout);
        timeout = ms ? setTimeout(done, ms, (
          new Error(`timed out after ${ms}ms`)
        )) : null;
      };

      Object.defineProperty(context, 'timeout', {
        value: ms => ms != null
          ? startTimeout(test.timeout = ms)
          : test.timeout ?? 2000,
        configurable: true
      });

      Promise.resolve()
        .then(() => startTimeout(test.timeout ?? 2000))
        .then(() => test.fn?.length < 2
          ? test.fn?.call(context, context)
          : test.fn?.call(context, context, done))
        .then(resolve, reject)
        .finally(() => {
          signal.removeEventListener('abort', abort);
          clearTimeout(timeout);
        });
    });
  }

  #collectResults(test, info) {
    let collect = tests => tests.reduce((all, test) => {
      let meta = this.#tests.get(test);
      if (meta?.info.fail) info.fail = true;
      if (meta) all.push(meta.info);
      return all;
    }, []);

    info.timing.end = performance.timeOrigin + performance.now();
    info.timing.duration = info.timing.end - info.timing.start;

    info.parent = this.#tests.get(test.parent)?.info;
    info.hooks.before = collect(test.hooks.before);
    info.hooks.beforeEach = collect(test.hooks.beforeEach);
    info.hooks.afterEach = collect(test.hooks.afterEach);
    info.hooks.after = collect(test.hooks.after);
    info.children = collect(test.children);

    info.total = test.children.reduce((total, test) => {
      let { info: i } = this.#tests.get(test) ?? {};

      return {
        passing: total.passing + (i?.total?.passing ?? 0) +
          (test.type === 'test' && i?.pass ? 1 : 0),
        failing: total.failing + (i?.total?.failing ?? 0) +
          (test.type === 'test' && i?.fail ? 1 : 0),
        skipped: total.skipped + (i?.total?.skipped ?? 0) +
          (test.type === 'test' && i?.skip ? 1 : 0)
      };
    }, { passing: 0, failing: 0, skipped: 0 });

    let counter = (total, test) => test.children
      .reduce(counter, total + (test.type === 'test' ? 1 : 0));
    info.total.count = test.children.reduce(counter, 0);

    info.total.remaining = info.total.count - (
      info.total.passing + info.total.failing + info.total.skipped
    );

    info.skip = test.skip;
    info.fail ??= !!info.error;
    info.pass = !info.skip && !info.fail;

    return info;
  }
}
