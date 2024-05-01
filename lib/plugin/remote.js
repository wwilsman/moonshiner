import { Connection } from '../util/connection.js';
import { DeferredPromise } from '../util/promise.js';

export class RemoteSync {
  #remotes = new Map();
  #connection; #test;

  #deferred = {
    start: new Map(),
    ready: new Map(),
    end: new Map()
  };

  apply(test) {
    this.#test = test;

    test.on('test:configure', async ({ config }) => {
      if (config.remote == null) return;
      this.#connection = new Connection(config.remote);

      await this.#connection.on((event, data) => {
        return test.trigger('connection:event', { event, data });
      });
    });

    test.on('test:ready', async ({ signal }) => {
      await DeferredPromise.all(this.#deferred.ready, signal);
    });

    test.on('test:end', async ({ signal }) => {
      await DeferredPromise.all(this.#deferred.end, signal);
    });

    test.on('test:after', async ({ test, signal }) => {
      await DeferredPromise.all(this.#remotes.get(test.id), signal);
    });

    test.on('remote:connect', ({ remote }) => {
      return this.#connect(remote);
    });

    test.on('connection:event', ({ event, data }) => {
      if (event === 'test:connected') {
        // @todo: sync config better?
        if (data.test.timeout != null && test.timeout == null)
          test.timeout = data.test.timeout;

        if (data.test.debug && !test.debug)
          test.debug = data.test.debug;
      }
    });

    test.on((event, data) => {
      if (event !== 'connection:event')
        return this.#connection?.send(event, data);
    });
  }

  #connect(remote) {
    if (Array.isArray(remote))
      return Promise.all(remote.map(r => this.#connect(r)));

    if (typeof remote === 'function')
      return Promise.resolve().then(remote).then(r => this.#connect(r));

    if (!(remote instanceof Connection))
      remote = new Connection(remote);

    this.#deferred.start.set(remote, new DeferredPromise());
    this.#deferred.ready.set(remote, new DeferredPromise());
    this.#deferred.end.set(remote, new DeferredPromise());
    let started = false;

    remote.on('test:start', async () => {
      started = true;
      this.#deferred.start.get(remote)?.resolve();
      await DeferredPromise.all(this.#deferred.start);
    });

    remote.on('test:end', async () => {
      this.#deferred.end.get(remote)?.resolve();
      await DeferredPromise.all(this.#deferred.end);
    });

    remote.on('test:ready', async ({ test }) => {
      if (!test.parent) this.#deferred.ready.get(remote)?.resolve();
      if (test.type !== 'hook') this.#createOrConnectTest(remote, test);
      if (!test.parent) await this.#test.ready();
    });

    remote.on('test:pass', async ({ test }) => {
      if (test.type !== 'hook') this.#createOrConnectTest(remote, test);
      this.#remotes.get(test.id)?.get(remote)?.resolve();
      await DeferredPromise.allSettled(this.#remotes.get(test.id));
    });

    remote.on('test:fail', async ({ test, error, aborted }) => {
      if (test.type !== 'hook') this.#createOrConnectTest(remote, test);
      this.#remotes.get(test.id)?.get(remote)?.reject(Object.assign(new Error(), error));
      await DeferredPromise.allSettled(this.#remotes.get(test.id));
      if (aborted) this.#test.abort(aborted);
    });

    remote.on('test:end', ({ aborted }) => {
      if (aborted) this.#test.abort(aborted);
      if (!this.#test.debug) remote.close();
    });

    remote.on('close', () => {
      if (started) this.#test.abort();
      this.#deferred.end.delete(remote);
      this.#deferred.ready.delete(remote);
      this.#deferred.start.delete(remote);
      for (let [, remotes] of this.#remotes)
        remotes.delete(remote);
    });

    remote.on((event, data) => {
      return this.#test.trigger('remote:event', { event, data });
    });

    remote.send('test:connected', {
      test: this.#test
    });

    return remote;
  }

  #createOrConnectTest(remote, test) {
    let parent = this.#test.lookup(test.parent?.id) ?? this.#test;
    let child = test.id === this.#test.id ? this.#test : (
      parent.children.find(c => c.id === test.id));
    let exists = !!child;

    if (!exists && test.type === 'test')
      child = parent.test(test.name, () => {});
    if (!exists && test.type === 'suite')
      child = parent.describe(test.name, () => {});

    if (test.skip) child.skip = true;
    if (test.only) child.only = true;

    if (child) {
      let remotes = this.#remotes.get(child.id) ?? new Map();
      this.#remotes.set(child.id, remotes);

      if (!remotes.has(remote))
        remotes.set(remote, new DeferredPromise());

      for (let t of test.children)
        this.#createOrConnectTest(remote, t);

      if (test.type === 'suite')
        remotes.get(remote).resolve();
    }
  }
}

export function remoteSync() {
  return new RemoteSync();
}
