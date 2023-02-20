export function deferred(callback) {
  let resolve, reject, promise;
  promise = new Promise((...a) => ([resolve, reject] = a));
  if (callback) promise = promise.then(a => callback(null, a), callback);
  return { promise, resolve, reject };
};

export default deferred;
