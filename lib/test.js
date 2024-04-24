import { TestRunner } from './runner.js';
import { TestSuiteContext } from './context.js';
import { DeferredPromise } from './util/promise.js';
import { Emitter } from './util/event.js';

export class Test extends Emitter {
  #runner; #configuring;

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

    super();
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
    this.path = parent?.parent ? [...parent.path, parent.name] : [];
    this.hooks = { before: [], after: [] };
    this.hooks.beforeEach = parent?.hooks.beforeEach.slice() ?? [];
    this.hooks.afterEach = parent?.hooks.afterEach.slice() ?? [];

    let id = parent?.parent ? `${parent.id} | ${name}` : name;
    let unique = parent?.children.filter(child => {
      return `${parent.id} | ${child.name}` === id;
    }).length ?? 0;

    this.id = (id && unique)
      ? `${id} (${unique + 1})`
      : `${id ?? unique}`;

    Object.defineProperty(this, 'timeout', {
      get: () => timeout ?? parent?.timeout,
      set: ms => ms && (timeout = ms),
      enumerable: true
    });

    Object.defineProperty(this, 'isolated', {
      get: () => this.children.some(c =>
        c.only || (c.type === 'suite' && c.isolated)),
      enumerable: true
    });

    this.#runner = TestRunner.resolve(this);
    if (Object.keys(config).length) this.configure(config);
  }

  async trigger(event, data, handler) {
    data = await super.trigger(event, data, handler) ?? data;
    return await this.parent?.trigger(event, data, handler) ?? data;
  }

  async use(plugins) {
    for (let plugin of [].concat(plugins ?? [])) {
      if (typeof plugin === 'function') await plugin?.(this);
      else await plugin?.apply?.(this);
    }
  }

  async configure(config) {
    let configuring = this.#configuring;
    if (!config) return configuring?.promise;

    let deferred = new DeferredPromise();
    this.#configuring = deferred;
    await configuring;

    if (typeof config === 'function')
      config = await config();

    if (config.plugins != null)
      await this.use(config.plugins);

    ({ config } = await this.trigger('test:configure', config,
      config => ({ test: this, config })
    ));

    if (config.debug != null)
      this.debug = !!config.debug;

    if (config.timeout != null)
      this.timeout = config.timeout;

    deferred.resolve();
  }

  context = {};

  define(property, value) {
    this.context[property] = value;
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

  #hook(type, options, fn) {
    if (typeof fn !== 'function') [options, fn] = [fn, options];
    let hook = new TestHook({ ...options, type, fn, parent: this });
    if (type === 'before') hook.run();
    this.hooks[type].push(hook);
    return hook;
  }

  before(options, fn) {
    return this.#hook('before', options, fn);
  }

  after(options, fn) {
    return this.#hook('after', options, fn);
  }

  beforeEach(options, fn) {
    return this.#hook('beforeEach', options, fn);
  }

  afterEach(options, fn) {
    return this.#hook('afterEach', options, fn);
  }

  run(options) {
    return this.#runner.run(this, options);
  }

  abort(reason) {
    return this.#runner.abort(this, reason);
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
