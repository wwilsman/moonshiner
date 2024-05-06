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
      if (config.remote == null || this.#connection) return;
      this.#connection = new Connection(config.remote);

      await this.#connection.on((event, data) => {
        return test.trigger('connection:event', { event, data });
      });
    });

    test.on('test:start', async ({ signal }) => {
      for (let [remote] of this.#deferred.start)
        await remote.send('test:start', { test });
      await DeferredPromise.all(this.#deferred.start, signal);
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

    test.on('test:abort', async ({ test, aborted }) => {
      for (let [remote] of this.#deferred.start)
        await remote.send('test:abort', { test, aborted });
    });

    test.on('remote:connect', async ({ remote }) => {
      await this.#connect(remote);
    });

    test.on('connection:event', ({ event, data }) => {
      if (event === 'test:connected') {
        // @todo: sync config better?
        if (data.test.timeout != null && test.timeout == null)
          test.timeout = data.test.timeout;
      }

      if (event === 'test:start')
        test.run();

      if (event === 'test:abort')
        test.abort(data.aborted);
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

    let running = false;

    this.#deferred.start.set(remote, new DeferredPromise());
    this.#deferred.ready.set(remote, new DeferredPromise());
    this.#deferred.end.set(remote, new DeferredPromise());

    remote.on('test:start', async () => {
      running = true;
      this.#test.run();
      this.#deferred.start.get(remote)?.resolve();
      await DeferredPromise.all(this.#deferred.start);
    });

    remote.on('test:end', async ({ aborted }) => {
      if (aborted) this.#test.abort(aborted);
      this.#deferred.end.get(remote)?.resolve();
      await DeferredPromise.all(this.#deferred.end);
      this.#deferred.start.set(remote, new DeferredPromise());
      this.#deferred.ready.set(remote, new DeferredPromise());
      this.#deferred.end.set(remote, new DeferredPromise());
      this.#disconnectTests(remote);
      running = false;

      if (!this.#test.debug)
        for (let [remote] of this.#deferred.end) remote.close();
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

    remote.on('close', () => {
      if (running) this.#test.abort();
      this.#deferred.start.delete(remote);
      this.#deferred.ready.delete(remote);
      this.#deferred.end.delete(remote);
      this.#disconnectTests(remote);
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

  #disconnectTests(remote) {
    for (let [id, remotes] of this.#remotes) {
      remotes.delete(remote);

      if (!remotes.size)
        this.#remotes.delete(id);
    }
  }
}

export function remoteSync() {
  return new RemoteSync();
}
