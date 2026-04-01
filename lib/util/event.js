export class Emitter {
  #listeners = new Map();

  on(event, listener, options) {
    if (typeof event === 'function') [event, listener] = ['*', event];
    let listeners = this.#listeners.get(event) ?? new Map();
    listeners.set(listener, { priority: 50, ...options });
    this.#listeners.set(event, listeners);
    return this;
  }

  off(event, listener) {
    if (typeof event === 'function') [event, listener] = ['*', event];
    let listeners = this.#listeners.get(event);
    listeners?.delete(listener);
    return this;
  }

  async trigger(event, data, handler) {
    data = await handler?.(data) ?? data ?? {};
    let emitted = new Set();

    let trigger = async (key, count = 0) => {
      while (true) {
        let [[listener] = []] = Array.from(this.#listeners.get(key ?? '*') ?? [])
          .filter(([listener]) => !emitted.has(listener))
          .sort((a, b) => a[1].priority - b[1].priority);
        if (!listener) break;

        let result = await listener(...(key ? [data] : [event, data]));
        if (result) data = await handler?.(result) ?? data;
        emitted.add(listener);
      }

      count += this.#listeners.get(key ?? '*')?.size ?? 0;
      return key ? await trigger(null, count) : count;
    };

    let pending = await trigger(event);
    while (emitted.size < pending)
      pending = await trigger(event);
    return data;
  }
}
