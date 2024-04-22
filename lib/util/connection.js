import { Emitter } from './event.js';
import { DeferredPromise } from './promise.js';
import { flattenJSON, unflattenJSON } from './json.js';

export class Connection extends Emitter {
  #pendingId = 0;
  #pending = new Map();
  #send; #receive;

  constructor(transport, options) {
    if (typeof transport === 'string') {
      if (transport === 'process')
        transport = globalThis.process;
      else if (transport.startsWith('ws'))
        transport = new globalThis.WebSocket(transport);
      else throw new Error(`Invalid connection transport "${transport}"`);
    } else if (!transport) {
      throw new Error('Missing connection transport');
    }

    super();
    this.transport = transport;
    this.#on('close', this.#onclose);
    this.#on('message', this.#onmessage);

    this.#send = options?.send ?? ((id, event, data) => ({
      request: { id, event, data: flattenJSON(data) }
    }));

    this.#receive = options?.receive ?? (
      async ({ request, response }, { resolve, reject }) => {
        if (request) {
          let { id, event, data } = request;

          try {
            data = unflattenJSON(data);
            let res = await this.trigger(event, data);
            data = res !== data ? flattenJSON(data) : null;
            response = { id, data };
          } catch (error) {
            let { name, message, stack } = error;
            response = { id, error: { name, message, stack } };
          }

          this.transport.send(JSON.stringify({ response }));
        } else if (response) {
          let { id, error, data } = response;
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

  close() {
    if (typeof this.transport.close === 'function')
      return this.transport.close();
    this.transport.kill?.();
  }
}
