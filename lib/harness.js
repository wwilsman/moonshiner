import { TestSuite } from './test.js';
import { emoji as defaultReporter } from './reporter/emoji.js';
import { remote as remoteReporter } from './reporter/remote.js';

const root = new TestSuite({ name: '<root>' });
const contexts = [root];

function callInParentContext(method, ...bound) {
  if (method === 'use')
    return (...args) => contexts[0].use(...args);

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

export function autorun(ms) {
  getRemoteConnection();
  clearTimeout(autorun.timer);
  if (ms) autorun.timer = setTimeout(run, ms);
}

export async function run(reporter) {
  clearTimeout(autorun.timer);

  let remote = getRemoteConnection();
  let abortController = new AbortController();
  let signal = abortController.signal;

  if (globalThis.process && !remote) {
    let terminate = () => abortController.abort();
    globalThis.process.on('SIGTERM', terminate);
    globalThis.process.on('SIGINT', terminate);
  }

  await root.run({
    reporter: reporter ?? (remote
      ? remoteReporter(remote)
      : defaultReporter()),
    signal
  });
}

export const use = callInParentContext('use');
export const describe = callInParentContext('describe');
export const test = callInParentContext('test');
export const it = callInParentContext('test');
export const before = callInParentContext('hook', 'before');
export const after = callInParentContext('hook', 'after');
export const beforeEach = callInParentContext('hook', 'beforeEach');
export const afterEach = callInParentContext('hook', 'afterEach');

autorun(1000);
