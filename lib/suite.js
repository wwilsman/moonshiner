import { Test } from './test.js';
import { TestSuiteContext } from './context.js';
import { Connection } from './connection.js';
import { DeferredPromise } from './util/promise.js';

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

  #coverage;

  configure(config) {
    let reporters = [].concat(config.reporters ?? [], (
      config.remote ? async function* remote(source) {
        let remote = await new Connection(config.remote);

        remote.on('devtools:enable', () => {
          globalThis.DevTools = {
            send: (method, params, meta) =>
              remote.send('devtools:send', {
                method, params, meta
              })
          };
        });

        for await (let { type, data } of source)
          yield await remote.send(type, data);
      } : []));

    if (config.coverage)
      this.#coverage = config.coverage;

    this.isRemoteTest = !!config.remote;
    if (!reporters.length) reporters = null;
    super.configure({ ...config, reporters });
  }

  async ready() {
    await this.#defined;
    await DeferredPromise.all(this.#connectionsReady);
    await Promise.all(this.children.map(c => c.ready?.()));
    if (this.children.some(c => c.only || c.runOnly)) this.runOnly = true;
  }

  describe(name, options, setup) {
    if (typeof setup !== 'function') [options, setup] = [setup, options];
    let suite = new TestSuite({ ...options, name, setup, parent: this });
    this.children.push(suite);
    return suite;
  }

  #connectionsStarted = new Map();
  #connectionsReady = new Map();

  connect(connection) {
    if (Array.isArray(connection))
      return Promise.all(connection.map(c => this.connect(c)));

    if (typeof connection === 'function')
      return Promise.resolve().then(connection).then(c => this.connect(c));

    if (!(connection instanceof Connection))
      connection = new Connection(connection);

    this.#connectionsStarted.set(connection, new DeferredPromise());
    this.#connectionsReady.set(connection, new DeferredPromise());

    connection.on('run:start', () => {
      this.#connectionsStarted.get(connection)?.resolve();
      return DeferredPromise.all(this.#connectionsStarted);
    });

    connection.on('test:plan', ({ test }) => {
      if (!test.parent) this.#connectionsReady.get(connection)?.resolve();
      if (test.type !== 'hook') this.#createOrConnectTest(connection, test);
      if (!test.parent) return this.ready();
    });

    connection.on('run:end', ({ coverage }) => {
      if (coverage) this.#coverage?.merge(coverage);
      if (!this.debug) connection.close();
    });

    connection.on('close', () => {
      this.#connectionsStarted.delete(connection);
      this.#connectionsReady.delete(connection);
    });

    return connection;
  }

  #createOrConnectTest(connection, test) {
    let parent = this.lookup(test.parent?.id) ?? this;
    let child = test.id === this.id ? this : (
      parent.children.find(c => c.id === test.id));
    let exists = !!child;

    if (!exists && test.type === 'test')
      child = parent.test(test.name, { skip: test.skip }, () => {});
    if (!exists && test.type === 'suite')
      child = parent.describe(test.name, { skip: test.skip }, () => {});

    if (child) {
      child.connectRemoteTest(connection, test);

      for (let t of test.children)
        this.#createOrConnectTest(connection, t);

      if (!exists && parent.type === 'test')
        this.#run?.(child);
    }
  }

  #run;

  async run({ context = {}, signal, ctx } = {}) {
    this.#run = test => test.run({ context, signal });
    let result = await super.run({ context, signal, ctx });
    this.#run = null;
    return result;
  }
}
