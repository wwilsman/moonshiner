export class TestContext {
  #test; #context;

  constructor(test, context) {
    this.#test = test;
    this.#context = context;
  }

  get name() {
    return this.#test.name;
  }

  test(name, options, fn) {
    let test = this.#test.test(name, options, fn);
    return test.run({ context: this.#context });
  }

  before(fn, options) {
    let hook = this.#test.hook('before', options, fn);
    return hook.run({ context: this.#context });
  }

  after(fn, options) {
    this.#test.hook('after', options, fn);
  }

  beforeEach(fn, options) {
    this.#test.hook('beforeEach', options, fn);
  }

  afterEach(fn, options) {
    this.#test.hook('afterEach', options, fn);
  }
}

export class TestSuiteContext {
  #suite;

  constructor(suite) {
    this.#suite = suite;
  }

  get name() {
    return this.#suite.name;
  }
}

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

  async use(...callbacks) {
    for (let callback of callbacks)
      await callback?.call(this, this);
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

  async run(reporter) {
    let {
      context = {},
      reporter: reporters,
      ctx = new TestContext(this, context)
    } = typeof reporter === 'function' ? { reporter } : reporter ?? {};

    let results = { test: this, start: Date.now() };
    (context.results ??= new Map()).set(this, results);

    let report = context.report ??= this.#reporter(reporters);
    let cleanup = context.cleanup ??= new Map();
    let isTestSuite = this.type === 'suite';
    let isTestHook = this.type === 'hook';

    let runHooks = async hooks => {
      if (hooks?.length && !isTestHook)
        for (let hook of hooks) await hook.run({ context, ctx });
    };

    try {
      if (!this.parent)
        await report('run:start', { ...results });

      if (isTestSuite) await this.ready();
      await report('test:plan', { ...results });

      if (!isTestSuite && !isTestHook && (this.skip ||
        (this.parent?.runOnly && !this.only)
      )) return results;

      if (isTestSuite) {
        let parents = [this.parent].reduce(function reduce(parents, parent) {
          return !parent?.parent ? parents : reduce([...parents, parent.parent], parent.parent);
        }, []);

        for (let [t, cleanup] of Array.from(context.cleanup.entries()).reverse())
          if (!parents.includes(t.parent)) await cleanup();
      }

      await runHooks(this.hooks.before);

      try {
        if (isTestSuite) {
          for (let child of this.children)
            await child.run({ context });
        } else {
          await runHooks(this.hooks.beforeEach);

          try {
            let timer;

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
                  timer = setTimeout(reject, this.timeout, (
                    new Error(`timed out after ${this.timeout}ms`)
                  ));
                })
              ]);

              if (isTestHook && typeof result === 'function' && (
                this.hookType === 'before' || this.hookType === 'beforeEach'
              )) cleanup.set(this, () => (cleanup.delete(this), result()));
            } finally {
              clearTimeout(timer);
            }
          } catch (error) {
            await runHooks(this.hooks.afterEach).catch(() => {});
            throw error;
          }

          await runHooks(this.hooks.afterEach);
        }
      } catch (error) {
        if (isTestSuite)
          await runHooks(this.hooks.after).catch(() => {});
        throw error;
      }

      await runHooks(this.hooks.after);
    } catch (error) {
      results.error = error;
    }

    results.end = Date.now();
    results.duration = results.end - results.start;

    results.hooks = {};
    results.hooks.before = this.hooks.before.map(h => context.results.get(h));
    results.hooks.beforeEach = this.hooks.beforeEach.map(h => context.results.get(h));
    results.hooks.afterEach = this.hooks.afterEach.map(h => context.results.get(h));
    results.hooks.after = this.hooks.after.map(h => context.results.get(h));
    results.children = this.children.map(c => context.results.get(c));

    results.fail = !!results.error ||
      results.children.some(c => c.fail) ||
      results.hooks.before.some(h => h.fail) ||
      results.hooks.beforeEach.some(h => h.fail) ||
      results.hooks.afterEach.some(h => h.fail) ||
      results.hooks.after.some(h => h.fail);
    results.pass = !results.fail;

    await report(results.pass ? 'test:pass' : 'test:fail', { ...results });

    if (!this.parent)
      await report('run:end', { ...results });

    return results;
  }

  #reporter(reporters) {
    return [].concat(reporters ?? []).reduce((last, reporter) => {
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

export class TestSuite extends Test {
  #defined;

  constructor({ setup, ...options } = {}) {
    super({ fn: () => {}, ...options });
    this.type = 'suite';

    this.#defined = Promise.resolve().then(async () => {
      let ctx = new TestSuiteContext(this);
      await setup?.call(ctx, ctx);
      this.isReady = true;
    });
  }

  async ready() {
    await this.#defined;

    await Promise.all(
      this.children.map(c => c.ready?.())
    );

    if (this.children.some(c => c.only || c.runOnly))
      this.runOnly = true;
  }

  describe(name, options, setup) {
    if (typeof setup !== 'function') [options, setup] = [setup, options];
    let suite = new TestSuite({ ...options, name, setup, parent: this });
    this.children.push(suite);
    return suite;
  }
}