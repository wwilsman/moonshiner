export class DeferredPromise {
  static async all(promises) {
    let completed = 0;

    while ((promises.size ?? promises.length) !== completed) {
      let total = (promises.size ?? promises.length);
      await Promise.all(promises instanceof Map ? promises.values() : promises);
      completed = total;
    }
  }

  constructor(callback) {
    this.promise = new Promise((resolve, reject) => {
      [this.resolve, this.reject] = [resolve, reject];
    }).then(v => callback?.(null, v) ?? v, callback);
  }

  then(...args) {
    return this.promise.then(...args);
  }

  catch(...args) {
    return this.promise.catch(...args);
  }
}
