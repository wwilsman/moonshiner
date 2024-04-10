import {
  TestSuite
} from './test.js';
import {
  autorun,
  captureConsole,
  devtools,
  remoteSync,
  reporterResolver
} from './plugin/index.js';

const root = new TestSuite({
  name: '<root>',
  remote: getRemoteVar(),
  captureConsole: true,
  plugins: [
    autorun(),
    remoteSync(),
    captureConsole(),
    reporterResolver(),
    globalThis?.window && devtools()
  ]
});

const contexts = [
  root
];

function callInParentContext(method, ...bound) {
  let caller = (overrides, ...args) => {
    let [name, options, fn] = [...bound, ...args];
    if (typeof options === 'function') [options, fn] = [fn, options];
    options = { ...options, ...overrides };

    let test = contexts[0][method](name, options, fn && (fn.length > 1
      ? function(ctx, done) { return apply(this, ctx, done); }
      : function(ctx) { return apply(this, ctx); }
    ));

    let apply = async (ctx, ...args) => {
      try {
        contexts.unshift(test);
        return await fn.apply(ctx, args);
      } finally {
        let i = contexts.indexOf(test);
        contexts.splice(i, 1);
      }
    };

    return test;
  };

  let test = (...args) => caller({}, ...args);

  if (method === 'describe' || method === 'test') {
    test.only = (...args) => caller({ only: true }, ...args);
    test.skip = (...args) => caller({ skip: true }, ...args);
  }

  return test;
}

function getRemoteVar() {
  let kRemote = '__MOONSHINER_REMOTE__';
  let remote = globalThis[kRemote] ?? globalThis.process?.env?.[kRemote];
  if (remote || !globalThis.window) return remote;

  let loc = new URL(globalThis.location);
  remote = loc.searchParams.get(kRemote);
  loc.searchParams.delete(kRemote);

  if (remote) globalThis.history.replaceState({}, '', loc);
  remote ??= globalThis.sessionStorage.getItem(kRemote);
  globalThis.sessionStorage.setItem(kRemote, remote);
  globalThis[kRemote] = remote;
  return remote;
}

export const describe = callInParentContext('describe');
export const test = callInParentContext('test');
export const it = callInParentContext('test');
export const before = callInParentContext('hook', 'before');
export const after = callInParentContext('hook', 'after');
export const beforeEach = callInParentContext('hook', 'beforeEach');
export const afterEach = callInParentContext('hook', 'afterEach');

export function configure(config) {
  return root.configure(config);
}

export function run({ signal } = {}) {
  return root.run({ signal });
}

export function abort() {
  return root.abort();
}
