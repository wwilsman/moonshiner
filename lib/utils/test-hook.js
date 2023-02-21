export function createTestHook(hook) {
  let unhook = null;
  let ctx = null;

  let maybe = (fn, args, cb) => {
    let result = fn?.apply(ctx, args);
    return typeof result?.then === 'function'
      ? result.then(cb) : cb(result);
  };

  let setup = (args, cb) => maybe(hook, args, result => (
    (typeof result === 'function' && (unhook = result), cb(result))
  ));

  let teardown = cb => maybe(unhook, [], result => (
    (ctx = (unhook = null)), cb ? cb(result) : result
  ));

  return function testHook(...args) {
    return teardown(() => ((ctx = this), setup(args, () => teardown)));
  };
}

export default createTestHook;
