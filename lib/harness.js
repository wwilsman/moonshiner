import { TestSuite } from './suite.js';
import { resolveReporter } from './reporter/index.js';

const root = new TestSuite({ name: '<root>' });
const contexts = [root];

function callInParentContext(method, ...bound) {
  if (method === 'configure')
    return (...args) => contexts[0].configure(...args);

  let caller = (overrides, ...args) => {
    let [name, options, fn] = [...bound, ...args];
    if (typeof options === 'function') [options, fn] = [fn, options];
    options = { ...options, ...overrides };

    let test = contexts[0][method](name, options,
      fn && async function(...args) {
        try {
          contexts.unshift(test);
          return await fn.apply(this, args);
        } finally {
          let i = contexts.indexOf(test);
          contexts.splice(i, 1);
        }
      });

    return test;
  };

  let test = (...args) => caller({}, ...args);

  if (method === 'describe' || method === 'test') {
    test.only = (...args) => caller({ only: true }, ...args);
    test.skip = (...args) => caller({ skip: true }, ...args);
  }

  return test;
}

function getRemoteConnection() {
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

export async function run({ signal } = {}) {
  await root.run({ signal });
}

export function configure({ ...config }) {
  config.reporter &&= resolveReporter(config.reporter);
  config.reporters &&= [].concat(config.reporter)
    .map(r => resolveReporter(r));
  root.configure(config);
}

configure({
  autorun: 1000,
  remote: getRemoteConnection(),

  get reporter() {
    if (this.remote) return;
    return resolveReporter('spec');
  }
});
