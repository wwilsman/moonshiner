import { Remote } from './remote.js';
import { DeferredPromise } from './util/promise.js';

export class TestContext {
  #test; #context; #signal;

  constructor(test, context, signal) {
    this.#test = test;
    this.#context = context;
    this.#signal = signal;
  }

  get name() {
    return this.#test.name;
  }

  get signal() {
    return this.#signal;
  }

  test(name, options, fn) {
    let test = this.#test.test(name, options, fn);

    return test.run({
      context: this.#context,
      signal: this.#signal
    });
  }

  before(fn, options) {
    let hook = this.#test.hook('before', options, fn);

    return hook.run({
      context: this.#context,
      signal: this.#signal,
      ctx: this
    });
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

  async run({
    reporter,
    context = {},
    signal,
    ctx
  }) {
    let results = { test: this, start: Date.now() };
    (context.results ??= new Map()).set(this, results);

    let report = context.report ??= this.#reporter(reporter);
    let cleanup = context.cleanup ??= new Map();
    let isTestSuite = this.type === 'suite';
    let isTestHook = this.type === 'hook';

    let outerSignal = signal;
    let abortController = new AbortController();

    let abort = () => {
      if (!results.pass) results.error ??= outerSignal.reason;
      abortController.abort(outerSignal.reason);
    };

    signal = abortController.signal;
    context.controller ??= abortController;
    outerSignal?.addEventListener('abort', abort);
    ctx ??= new TestContext(this, context, signal);

    let runHooks = async type => {
      let hooks = this.hooks[type];
      if (!hooks?.length || isTestHook) return;

      for (let hook of hooks) {
        let { error } = await hook.run({ signal, context, ctx });
        if (error && type.startsWith('before')) throw error;
      }
    };

    try {
      if (!this.parent)
        await report('run:start', { ...results });

      if (isTestSuite) await this.ready();
      await report('test:plan', { ...results });

      if (!isTestSuite && !isTestHook &&
          (this.skip || (this.parent?.runOnly && !this.only))) {
        outerSignal?.removeEventListener('abort', abort);
        return results;
      }

      if (isTestSuite) {
        let parents = [this.parent].reduce(function reduce(parents, parent) {
          return !parent?.parent ? parents : reduce([...parents, parent.parent], parent.parent);
        }, []);

        for (let [t, cleanup] of Array.from(context.cleanup.entries()).reverse())
          if (!parents.includes(t.parent)) await cleanup();
      }

      await runHooks('before');

      try {
        if (isTestSuite) {
          for (let child of this.children) {
            await child.run({ signal, context });
            if (signal.reason) break;
          }
        } else {
          await runHooks('beforeEach');

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
                  if (signal.reason) return reject(signal.reason);
                  signal.addEventListener('abort', () => reject(signal.reason));

                  if (!this.timeout) return;
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
          } finally {
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

    // @todo: make better here down
    results.hooks = {};
    results.hooks.before = this.hooks.before.map(h => context.results.get(h)).filter(Boolean);
    results.hooks.beforeEach = this.hooks.beforeEach.map(h => context.results.get(h)).filter(Boolean);
    results.hooks.afterEach = this.hooks.afterEach.map(h => context.results.get(h)).filter(Boolean);
    results.hooks.after = this.hooks.after.map(h => context.results.get(h)).filter(Boolean);
    results.children = this.children.map(c => context.results.get(c)).filter(Boolean);

    results.fail = !!results.error ||
      results.children.some(c => c.fail) ||
      results.hooks.before.some(h => h.fail) ||
      results.hooks.beforeEach.some(h => h.fail) ||
      results.hooks.afterEach.some(h => h.fail) ||
      results.hooks.after.some(h => h.fail);
    results.pass = !results.fail;
    // @todo: make better here up

    await report(results.pass ? 'test:pass' : 'test:fail', { ...results });
    if (!this.parent) await report('run:end', { ...results });
    if (!isTestHook) abortController.abort(results.error);
    outerSignal?.removeEventListener('abort', abort);

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
    });
  }

  async ready() {
    await this.#defined;
    await DeferredPromise.all(this.#remoteTests.ready);
    await Promise.all(this.children.map(c => c.ready?.()));
    if (this.children.some(c => c.only || c.runOnly)) this.runOnly = true;
  }

  describe(name, options, setup) {
    if (typeof setup !== 'function') [options, setup] = [setup, options];
    let suite = new TestSuite({ ...options, name, setup, parent: this });
    this.children.push(suite);
    return suite;
  }

  #remoteTests = {
    started: new Map(),
    ready: new Map(),
    refs: new Map()
  };

  async connect(remote) {
    if (typeof remote === 'function')
      remote = await remote();
    if (Array.isArray(remote))
      return Promise.all(remote.map(r => this.connect(r)));
    if (!(remote instanceof Remote))
      remote = new Remote(remote);

    let started = false;
    let remotes = this.#remoteTests;
    remotes.started.set(remote, new DeferredPromise());
    remotes.ready.set(remote, new DeferredPromise());

    return remote.on(async (event, details) => {
      if (event === 'run:start') {
        started = true;
        remotes.started.get(remote).resolve();
        await DeferredPromise.all(remotes.started);
      } else if (event === 'test:plan') {
        if (!details.test.parent && !remotes.refs.has(details.test.id))
          remotes.refs.set(details.test.id, { test: this, deferred: remotes.ready });
        this.#pairRemoteTest(remote, details.test);
        if (!details.test.parent) await this.ready();
      } else if (event === 'test:pass' || event === 'test:fail') {
        this.#handleRemoteTest(remote, details);
      } else if (event === 'run:end') {
        remote.close();
      } else if (event === 'close') {
        this.#disconnectRemoteTests(remote, started);

        if (!started) {
          remotes.started.delete(remote);
          remotes.ready.delete(remote);
        }
      }
    });
  }

  #pairRemoteTest(remote, test) {
    if (test.type !== 'suite' && test.type !== 'test') return;
    let { refs } = this.#remoteTests;

    let ref = refs.get(test.id) ?? { deferred: new Map() };
    let deferred = ref.deferred.get(remote) ?? new DeferredPromise();
    ref.deferred.set(remote, deferred);
    refs.set(test.id, ref);

    let parent = refs.get(test.parent?.id);
    parent = parent?.ctx ?? parent?.test ?? this;

    if (test.type === 'test') {
      ref.test ??= parent.test(test.name, ctx => (
        ref.ctx = ctx, DeferredPromise.all(ref.deferred)
      ), { skip: test.skip, timeout: 0 });
    } else {
      ref.test ??= parent.describe(test.name, () => (
        DeferredPromise.all(ref.deferred)
      ), { skip: test.skip });
    }

    if (test.children.length) {
      for (let child of test.children)
        this.#pairRemoteTest(remote, child);
    }

    if (test.skip || test.type !== 'test') {
      ref.deferred.delete(remote);
      deferred.resolve();
    }
  }

  #handleRemoteTest(remote, { pass, test, error, children }) {
    for (let child of children ?? []) this.#handleRemoteTest(remote, child);
    if (pass) this.#remoteTests.refs.get(test.id)?.deferred.get(remote)?.resolve?.();
    else this.#remoteTests.refs.get(test.id)?.deferred.get(remote)?.reject?.(error);
    this.#remoteTests.refs.get(test.id)?.deferred.delete(remote);
  }

  #disconnectRemoteTests(remote, abort) {
    let aborted = false;

    for (let [id, ref] of this.#remoteTests.refs) {
      if (abort && !aborted) {
        let deferred = ref.deferred.get(remote);
        deferred?.reject(new DOMException('Test disconnected', 'AbortError'));
        aborted = ref.deferred.delete(remote);
      } else {
        ref.deferred.delete(remote);

        if (!ref.deferred.size) {
          let i = ref.test.parent?.children.indexOf(ref.test) ?? -1;
          if (~i) ref.test.parent.children.splice(i, 1);
          this.#remoteTests.refs.delete(id);
        }
      }
    }
  }
}
