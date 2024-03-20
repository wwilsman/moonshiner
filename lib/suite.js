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

  connect(connection) {
    if (Array.isArray(connection))
      return Promise.all(connection.map(c => this.connect(c)));
    if (typeof connection === 'function')
      return Promise.resolve().then(connection).then(c => this.connect(c));
    if (!(connection instanceof Connection))
      connection = new Connection(connection);

    let running = false;
    let remotes = this.#remoteTests;
    remotes.started.set(connection, new DeferredPromise());
    remotes.ready.set(connection, new DeferredPromise());

    return connection.on(async (event, details) => {
      if (event === 'run:start') {
        running = true;
        remotes.started.get(connection).resolve();
        await DeferredPromise.all(remotes.started);
      } else if (event === 'test:plan') {
        if (!details.test.parent && !remotes.refs.has(details.test.id))
          remotes.refs.set(details.test.id, { test: this, deferred: remotes.ready });
        this.#pairRemoteTest(connection, details.test);
        if (!details.test.parent) await this.ready();
      } else if (event === 'test:pass' || event === 'test:fail') {
        this.#handleRemoteTest(connection, details);
      } else if (event === 'run:end') {
        if (!this.debug) connection.close();
      } else if (event === 'close') {
        this.#disconnectRemoteTests(connection, running);

        if (!running) {
          remotes.started.delete(connection);
          remotes.ready.delete(connection);
        }
      }
    });
  }

  #pairRemoteTest(connection, test) {
    if (test.type !== 'suite' && test.type !== 'test') return;
    let { refs } = this.#remoteTests;

    let ref = refs.get(test.id) ?? { deferred: new Map() };
    let deferred = ref.deferred.get(connection) ?? new DeferredPromise();
    ref.deferred.set(connection, deferred);
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
        this.#pairRemoteTest(connection, child);
    }

    if (test.skip || test.type !== 'test') {
      ref.deferred.delete(connection);
      deferred.resolve();
    }
  }

  #handleRemoteTest(connection, { pass, test, error, children }) {
    let ref = this.#remoteTests.refs.get(test.id);
    for (let child of children ?? []) this.#handleRemoteTest(connection, child);
    if (pass) ref?.deferred.get(connection)?.resolve?.();
    else ref?.deferred.get(connection)?.reject?.(error);
    ref?.deferred.delete(connection);
  }

  #disconnectRemoteTests(connection, abort) {
    let aborted = false;

    for (let [id, ref] of this.#remoteTests.refs) {
      if (abort && !aborted) {
        let deferred = ref.deferred.get(connection);
        deferred?.reject(new DOMException('Test disconnected', 'AbortError'));
        aborted = ref.deferred.delete(connection);
      } else {
        ref.deferred.delete(connection);

        if (!ref.deferred.size) {
          let i = ref.test.parent?.children.indexOf(ref.test) ?? -1;
          if (~i) ref.test.parent.children.splice(i, 1);
          this.#remoteTests.refs.delete(id);
        }
      }
    }
  }
}
