export class DeferredPromise {
  static async allSettled(promises = [], signal) {
    let completed = 0;
    let settled = [];

    while ((promises.size ?? promises.length) !== completed) {
      let total = (promises.size ?? promises.length);

      settled = await new Promise((resolve, reject) => {
        let abort = () => reject(signal?.reason);
        if (signal?.aborted) return abort();

        Promise.allSettled(Array.from(
          promises instanceof Map ? promises.values() : promises,
          promise => promise.promise ?? promise
        )).then(resolve, reject).finally(() => {
          signal?.removeEventListener('abort', abort);
        });

        signal?.addEventListener('abort', abort);
      });

      completed = total;
    }

    return settled;
  }

  static async all(promises, signal) {
    let settled = await this.allSettled(promises, signal);
    let rejected = settled.find(s => s.reason)?.reason;
    if (rejected) throw rejected;
    return settled;
  }

  #callback;

  constructor(signal, callback) {
    if (typeof signal === 'function')
      [signal, callback] = [callback, signal];
    this.#callback = callback;

    let abort = () => this.reject(signal?.reason);
    signal?.addEventListener('abort', abort);

    this.#promise = new Promise((resolve, reject) => {
      [this.#resolve, this.#reject] = [resolve, reject];
    }).then(this.#onresolve, this.#onreject).finally(() => {
      signal?.removeEventListener('abort', abort);
    });
  }

  #await; #promise;
  #resolve; #reject;

  get promise() {
    this.#await = true;
    return this.#promise;
  }

  resolve = value => {
    this.#resolve(value);
  };

  reject = reason => {
    this.rejected = reason;
    if (this.#await) this.#reject(reason);
  };

  #onresolve = value => this.#callback
    ? this.#callback(null, this.resolved = value)
    : Promise.resolve(this.resolved = value);

  #onreject = reason => this.#callback
    ? this.#callback(this.rejected = reason)
    : Promise.reject(this.rejected = reason);

  then(...args) {
    if (this.rejected) this.#reject(this.rejected);
    return this.promise.then(...args);
  }

  catch(...args) {
    if (this.rejected) this.#reject(this.rejected);
    return this.promise.catch(...args);
  }
}
