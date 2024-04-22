export class Emitter {
  #listeners = new Map();

  on(event, listener) {
    if (typeof event === 'function') [event, listener] = ['*', event];
    let listeners = this.#listeners.get(event) ?? new Set();
    this.#listeners.set(event, listeners);
    listeners.add(listener);
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
      for (let listener of this.#listeners.get(key ?? '*') ?? []) {
        if (emitted.has(listener)) continue;
        let result = await listener(...(key ? [data] : [event, data]));
        data = result ? await handler?.(result) ?? data : data;
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
