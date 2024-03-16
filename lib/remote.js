import { DeferredPromise } from './util/promise.js';
import { flattenJSON, unflattenJSON } from './util/json.js';

export class Remote {
  #pendingId = 0;
  #pending = new Map();
  #listeners = new Map();
  #send; #receive;

  constructor(source, options) {
    this.source = source;
    this.#on('close', this.#onclose);
    this.#on('message', this.#onmessage);

    if ('readyState' in source && !source.readyState) {
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

          this.source.send(JSON.stringify({
            response: { id, data }
          }));
        } else if (response) {
          let { id, data } = response;
          resolve(id, unflattenJSON(data));
        }
      });
  }

  #on(event, callback) {
    if (typeof this.source.addEventListener === 'function')
      this.source.addEventListener(event, callback);
    else if (typeof this.source.on === 'function')
      this.source.on(event, callback);
  }

  #off(event, callback) {
    if (typeof this.source.removeEventListener === 'function')
      this.source.removeEventListener(event, callback);
    else if (typeof this.source.off !== 'function')
      this.source.off(event, callback);
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
    let id = this.#pendingId++;
    let deferred = new DeferredPromise();
    this.#pending.set(id, deferred);

    this.source.send(JSON.stringify(
      await this.#send(id, ...args)
    ));

    return await deferred;
  }

  on(type, listener) {
    if (typeof type === 'function')
      [type, listener] = ['*', type];
    let listeners = this.#listeners.get(type);
    if (!listeners) this.#listeners.set(type, listeners = new Set());
    listeners.add(listener);
    return this;
  }

  async trigger(type, data) {
    for (let listener of this.#listeners.get(type) ?? [])
      data = await listener(data ?? {}) ?? data;
    for (let listener of this.#listeners.get('*') ?? [])
      data = await listener(type, data ?? {}) ?? data;
    return data;
  }

  close() {
    if (typeof this.source.close === 'function')
      return this.source.close();
    this.source.kill?.();
  }
}

export function connect(sources) {
  return test => {
    test.hook('before', async () => {
      await test.connect(sources);
      await test.ready();
    });
  };
}
