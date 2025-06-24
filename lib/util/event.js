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
      let listeners = Array.from(this.#listeners.get(key ?? '*') ?? [])
        .sort((a, b) => a[1].priority - b[1].priority);

      for (let [listener] of listeners) {
        if (emitted.has(listener)) continue;
        let result = await listener(...(key ? [data] : [event, data]));
        if (result) data = await handler?.(result) ?? data;
        emitted.add(listener);
      }

      count += this.#listeners.get(key ?? '*')?.size ?? 0;
      return key ? count : await trigger(event, count);
    };

    let pending = await trigger();
    while (emitted.size < pending)
      pending = await trigger();
    return data;
  }
}
