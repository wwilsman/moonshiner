import { TestRunner } from './runner.js';
import { TestSuiteContext } from './context.js';
import { DeferredPromise } from './util/promise.js';

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
    this.debug = !!debug;
    this.only = !!only;
    this.skip = !!(skip ?? parent?.skip);
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
      : `${id ?? unique}`;

    Object.defineProperty(this, 'timeout', {
      get: () => timeout ?? parent?.timeout ?? 2000,
      set: ms => ms && (timeout = ms)
    });

    Object.defineProperty(this, 'isolated', {
      get: () => this.children.some(c => {
        return c.only || (c.type === 'suite' && c.isolated);
      })
    });

    this.#runner = TestRunner.resolve(this);
    if (config.plugins) this.configure(config);
  }

  #runner;
  #configuring;
  #plugins = [];
  #listeners = new Map();

  async configure(config) {
    let configuring = this.#configuring;
    if (!config) return configuring?.promise;

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
      await plugin?.apply?.(this);
    }

    deferred.resolve();
  }

  context = {};

  define(property, value) {
    this.context[property] = value;
  }

  hook(type, options, fn) {
    if (typeof fn !== 'function') [options, fn] = [fn, options];
    let hook = new TestHook({ ...options, type, fn, parent: this });
    if (type === 'before') hook.run();
    this.hooks[type].push(hook);
    return hook;
  }

  test(name, options, fn) {
    if (typeof fn !== 'function') [options, fn] = [fn, options];
    let test = new Test({ ...options, name, fn, parent: this });
    test.run();
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
        if (!emitted.has(listener))
          await listener(...(key ? args : [event, ...args]));
        emitted.add(listener);
      }

      let count = this.#listeners.get(key ?? '*')?.length ?? 0;
      return key ? count : (count + await trigger(event));
    };

    let pending = await trigger();
    while (emitted.size < pending) pending = await trigger();

    await this.parent?.emit(event, ...args);
  }

  run(options) {
    return this.#runner.run(this, options);
  }

  abort() {
    return this.#runner.abort(this);
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
      let context = new TestSuiteContext(this);
      await setup?.call(context, context);
    });
  }

  async ready() {
    await this.#defined;
    await Promise.all(this.children.map(c => c.ready?.()));
  }

  describe(name, options, setup) {
    if (typeof setup !== 'function') [options, setup] = [setup, options];
    let suite = new TestSuite({ ...options, name, setup, parent: this });
    this.children.push(suite);
    return suite;
  }
}
