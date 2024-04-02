import { DeferredPromise } from './util/promise.js';
import { flattenJSON, unflattenJSON } from './util/json.js';

export class Connection {
  #pendingId = 0;
  #pending = new Map();
  #listeners = new Map();
  #send; #receive;

  constructor(transport, options) {
    if (typeof transport === 'string') {
      if (transport === 'process')
        transport = globalThis.process;
      else if (transport.startsWith('ws'))
        transport = new globalThis.WebSocket(transport);
      else throw new Error(`Invalid remote transport "${transport}"`);
    }

    this.transport = transport;
    this.#on('close', this.#onclose);
    this.#on('message', this.#onmessage);

    this.#send = options?.send ?? ((id, type, data) => ({
      request: { id, type, data: flattenJSON(data) }
    }));

    this.#receive = options?.receive ?? (
      async ({ request, response }, { resolve, reject }) => {
        if (request) {
          let { id, type, data } = request;

          try {
            data = unflattenJSON(data);
            data = await this.trigger(type, data);
            data = flattenJSON(data);
            response = { id, data };
          } catch (error) {
            let { name, message, stack } = error;
            response = { id, error: { name, message, stack } };
          }

          this.transport.send(JSON.stringify({ response }));
        } else if (response) {
          let { id, data, error } = response;
          if (!error) resolve(id, unflattenJSON(data));
          else reject(id, Object.assign(new Error(), error));
        }
      });

    if ('readyState' in transport && !transport.readyState) {
      let ready = new DeferredPromise();
      this.#on('open', ready.resolve);
      this.#on('error', ready.reject);
      this.then = (...args) => ready
        .then(() => (this.then = null, this))
        .then(...args);
    }
  }

  #on(event, callback) {
    if (typeof this.transport.addEventListener === 'function')
      this.transport.addEventListener(event, callback);
    else if (typeof this.transport.on === 'function')
      this.transport.on(event, callback);
  }

  #off(event, callback) {
    if (typeof this.transport.removeEventListener === 'function')
      this.transport.removeEventListener(event, callback);
    else if (typeof this.transport.off !== 'function')
      this.transport.off(event, callback);
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

    this.transport.send(JSON.stringify(
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
    if (typeof this.transport.close === 'function')
      return this.transport.close();
    this.transport.kill?.();
  }
}
