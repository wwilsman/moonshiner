import { DeferredPromise } from './util/promise.js';
import { flattenJSON, unflattenJSON } from './util/json.js';

export class Remote {
  #pendingId = 0;
  #pending = new Map();
  #listeners = new Map();
  #source; #ready; #send; #receive;

  constructor(source, options) {
    this.#source = source;
    this.#on('close', this.#onclose);
    this.#on('message', this.#onmessage);

    if ('readyState' in source) {
      let ready = new DeferredPromise();
      this.#on('open', ready.resolve);
      this.#on('error', ready.reject);
      this.then = (...args) => ready
        .then(() => (this.then = null, this))
        .then(...args);
    }

    this.#send = options?.send ?? ((id, type, data) => ({
      request: { id, type, data: flattenJSON(data) }
    }));

    this.#receive = options?.receive ?? (
      async ({ request, response }, { resolve }) => {
        if (request) {
          let { id, type, data } = request;

          data = unflattenJSON(data);
          data = await this.trigger(type, data);
          data = flattenJSON(data);

          this.#source.send(JSON.stringify({
            response: { id, data }
          }));
        } else if (response) {
          let { id, data } = response;
          resolve(id, unflattenJSON(data));
        }
      });
  }

  #on(event, callback) {
    if (typeof this.#source.on !== 'function')
      this.#source.addEventListener(event, callback);
    else this.#source.on(event, callback);
  }

  #off(event, callback) {
    if (typeof this.#source.off !== 'function')
      this.#source.removeEventListener(event, callback);
    else this.#source.off(event, callback);
  }

  #onmessage = async data => {
    data = (data.data ?? data).toString();

    await this.#receive(JSON.parse(data), {
      resolve: (id, value) => (
        this.#pending.get(id)?.resolve(value),
        this.#pending.delete(id)),

      reject: (id, reason) => (
        this.#pending.get(id)?.reject(reason),
        this.#pending.delete(id))
    });
  };

  #onclose = async () => {
    this.#off('message', this.#onmessage);
    this.#off('close', this.#onclose);
    await this.trigger('close');
  };

  async send(...args) {
    let id = `${this.#pendingId++}`;
    let deferred = new DeferredPromise();
    this.#pending.set(id, deferred);

    this.#source.send(JSON.stringify(
      await this.#send(id, ...args)
    ));

    await deferred;
  }

  on(type, listener) {
    let listeners = this.#listeners.get(type);
    if (!listeners) this.#listeners.set(type, listeners = new Set());
    listeners.add(listener);
  }

  async trigger(type, data) {
    for (let listener of this.#listeners.get(type) ?? [])
      data = await listener(data ?? {}) ?? data;
    return data;
  }

  close() {
    if (typeof this.#source.close === 'function')
      return this.#source.close();
    this.#source.kill?.();
  }
}

export class TestRemote {
  #started = new Map();
  #ready = new Map();
  #refs = new Map();
  #root;

  constructor(test) {
    this.#root = test;
  }

  async connect(sources) {
    if (typeof sources === 'function')
      sources = await sources();

    for (let source of [].concat(sources ?? [])) {
      let remote = await new Remote(source);
      this.#ready.set(remote, new DeferredPromise());
      this.#started.set(remote, new DeferredPromise());

      remote.on('run:start', () => {
        this.#started.get(remote).resolve();
        return DeferredPromise.all(this.#started);
      });

      remote.on('test:plan', ({ test }) => {
        if (!test.parent && !this.#refs.has(test.id))
          this.#refs.set(test.id, { test: this.#root, deferred: this.#ready });
        this.#pair(remote, test);
      });

      remote.on('test:pass', details => {
        for (let child of details.children)
          this.#handle(remote, child);
        this.#handle(remote, details);
      });

      remote.on('test:fail', details => {
        for (let child of details.children)
          this.#handle(remote, child);
        this.#handle(remote, details);
      });

      remote.on('run:end', () => {
        remote.close();
      });

      remote.on('close', () => {
        this.#ready.delete(remote);
        this.#started.delete(remote);

        for (let [, ref] of this.#refs)
          ref.deferred.delete(remote);
      });
    }

    await DeferredPromise.all(this.#ready);
  }

  #pair(remote, test) {
    if (test.type === 'suite' || (test.type === 'test' && !test.skip)) {
      let ref = this.#refs.get(test.id) ?? { deferred: new Map() };
      let deferred = ref.deferred.get(remote) ?? new DeferredPromise();
      ref.deferred.set(remote, deferred);
      this.#refs.set(test.id, ref);

      let parent = this.#refs.get(test.parent?.id);
      parent = parent?.ctx ?? parent?.test ?? this.#root;

      if (test.type === 'test') {
        ref.test ??= parent.test(test.name, ctx =>
          (ref.ctx = ctx, DeferredPromise.all(ref.deferred)));
      } else {
        ref.test ??= parent.describe(test.name, () => DeferredPromise.all(ref.deferred));
        for (let child of test.children) this.#pair(remote, child);
        deferred.resolve();
      }
    }
  }

  #handle(remote, { pass, test, error }) {
    if (pass) this.#refs.get(test.id)?.deferred.get(remote)?.resolve?.();
    else this.#refs.get(test.id)?.deferred.get(remote)?.reject?.(error);
  }
}

export function connect(sources) {
  return test => {
    test.remote ??= new TestRemote(test);

    test.hook('before', async () => {
      await test.remote.connect(sources);
    }, { timeout: 10000 });
  };
}
