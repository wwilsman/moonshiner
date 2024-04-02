export class DeferredPromise {
  static async allSettled(promises = []) {
    let completed = 0;
    let settled = [];

    while ((promises.size ?? promises.length) !== completed) {
      let total = (promises.size ?? promises.length);

      settled = await Promise.allSettled(Array.from(
        promises instanceof Map ? promises.values() : promises,
        promise => promise.promise ?? promise
      ));

      completed = total;
    }

    return settled;
  }

  static async all(promises) {
    let settled = await this.allSettled(promises);
    let rejected = settled.find(s => s.reason)?.reason;
    if (rejected) throw rejected;
    return settled;
  }

  #callback;

  constructor(callback) {
    this.#callback = callback;
    this.promise = new Promise((resolve, reject) => {
      [this.resolve, this.reject] = [resolve, reject];
    }).then(this.#resolve, this.#reject);
  }

  #resolve = value => this.#callback
    ? this.#callback(null, this.resolved = value)
    : Promise.resolve(this.resolved = value);

  #reject = reason => this.#callback
    ? this.#callback(this.rejected = reason)
    : Promise.reject(this.rejected = reason);

  then(...args) {
    return this.promise.then(...args);
  }

  catch(...args) {
    return this.promise.catch(...args);
  }
}
