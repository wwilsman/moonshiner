export function bind(context, methods = [
  'describe', 'xdescribe', 'fdescribe', 'it', 'xit', 'fit',
  'beforeAll', 'beforeEach', 'afterAll', 'afterEach'
]) {
  return function middleware(_event, next) {
    middleware.bound ??= methods.reduce((ctx, name) =>
      ((ctx[name] = this[name]), ctx), (context ?? {}));
    return next?.();
  };
}

export default bind;
