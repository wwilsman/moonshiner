import { Connection } from '../util/connection.js';
import { DeferredPromise } from '../util/promise.js';

export class RemoteSync {
  #connectionsStarted = new Map();
  #connectionsReady = new Map();
  #testConnections = new Map();
  #remote; #test;

  apply(test) {
    this.#test = test;

    test.on('test:configure', ({ config }) => {
      if (config.remote == null) return;

      this.#remote = new Connection(config.remote).on((event, data) => {
        return test.trigger('remote:event', { event, data });
      });
    });

    test.on('test:start', async () => {
      await this.#remote;
      await DeferredPromise.all(this.#connectionsReady);
    });

    test.on('test:after', async ({ test }) => {
      let connections = this.#testConnections.get(test.id);
      await DeferredPromise.all(connections);
    });

    test.on('remote:connect', ({ connection }) => {
      return this.#connect(connection);
    });

    test.on((event, data) => {
      return this.#remote?.send(event, data);
    });
  }

  #connect(connection) {
    if (Array.isArray(connection))
      return Promise.all(connection.map(c => this.#connect(c)));

    if (typeof connection === 'function')
      return Promise.resolve().then(connection).then(c => this.#connect(c));

    if (!(connection instanceof Connection))
      connection = new Connection(connection);

    this.#connectionsStarted.set(connection, new DeferredPromise());
    this.#connectionsReady.set(connection, new DeferredPromise());

    connection.on('test:start', async () => {
      this.#connectionsStarted.get(connection)?.resolve();
      await DeferredPromise.all(this.#connectionsStarted);
    });

    connection.on('test:ready', async ({ test }) => {
      if (!test.parent) this.#connectionsReady.get(connection)?.resolve();
      if (test.type !== 'hook') this.#createOrConnectTest(connection, test);
      if (!test.parent) await this.#test.ready();
    });

    connection.on('test:pass', async ({ test }) => {
      let connections = this.#testConnections.get(test.id);
      connections?.get(connection)?.resolve();
      await DeferredPromise.allSettled(connections);
    });

    connection.on('test:fail', async ({ test, error }) => {
      let connections = this.#testConnections.get(test.id);
      connections?.get(connection)?.reject(Object.assign(new Error(), error));
      await DeferredPromise.allSettled(connections);
    });

    connection.on('test:end', () => {
      if (!this.#test.debug) connection.close();
    });

    connection.on('close', () => {
      for (let [, connections] of this.#testConnections)
        connections.delete(connection);
      this.#connectionsStarted.delete(connection);
      this.#connectionsReady.delete(connection);
    });

    return connection;
  }

  #createOrConnectTest(connection, test) {
    let parent = this.#test.lookup(test.parent?.id) ?? this.#test;
    let child = test.id === this.#test.id ? this.#test : (
      parent.children.find(c => c.id === test.id));
    let exists = !!child;

    if (!exists && test.type === 'test')
      child = parent.test(test.name, { skip: test.skip }, () => {});

    if (!exists && test.type === 'suite')
      child = parent.describe(test.name, { skip: test.skip }, () => {});

    if (child) {
      let connections = this.#testConnections.get(child.id) ?? new Map();
      this.#testConnections.set(child.id, connections);

      if (!connections.has(connection))
        connections.set(connection, new DeferredPromise());

      for (let t of test.children)
        this.#createOrConnectTest(connection, t);

      if (test.type === 'suite')
        connections.get(connection).resolve();
    }
  }
}

export function remoteSync() {
  return new RemoteSync();
}
