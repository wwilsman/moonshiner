const defaultContextMethods = [
  'describe', 'xdescribe', 'fdescribe', 'it', 'xit', 'fit',
  'beforeAll', 'beforeEach', 'afterAll', 'afterEach',
  'DevTools'
];

export function bind(context, helpers, methods) {
  if (Array.isArray(helpers)) [methods, helpers] = [helpers];
  methods ??= defaultContextMethods;
  helpers ??= {};

  return function middleware(_event, next) {
    middleware.bound ??= [...methods, ...Object.keys(helpers)].reduce(
      (ctx, f) => ((ctx[f] = helpers[f]?.bind(this) ?? this[f]), ctx),
      (context ?? {}));
    return next?.();
  };
}

export default bind;
