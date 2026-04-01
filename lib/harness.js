/**
 * @typedef {Object} TestOptions
 * @property {number} [timeout] - How long to wait before failing the test (in milliseconds)
 * @property {boolean} [skip] - Skip running this test
 * @property {boolean} [only] - Only run this test (and other tests marked with 'only')
 */

/**
 * @typedef {Object} BrowserConfig
 * @property {string} [name] - Browser display name (e.g., "Chrome", "Firefox", "Chrome (mobile)")
 * @property {string} [browser] - Actual browser to use when name is custom (e.g., name: "Chrome (mobile)", browser: "Chrome")
 * @property {string} [url] - URL to open when the browser launches
 * @property {number} [width] - Browser viewport width in pixels
 * @property {number} [height] - Browser viewport height in pixels
 * @property {number} [scale] - Device pixel ratio (e.g., 2 for retina displays)
 */

/**
 * @typedef {Object} ScreenshotConfig
 * @property {string} [directory] - Where to save screenshot files (defaults to "__screenshots__")
 * @property {Object} [suffix] - File suffixes for different screenshot types
 * @property {string} [suffix.new] - Suffix for newly captured screenshots (defaults to ".new")
 * @property {string} [suffix.diff] - Suffix for diff images showing differences (defaults to ".diff")
 * @property {function(string, string, string): Promise<{match: boolean}>} [compare] - Custom function to compare screenshots. Receives baseline path, new screenshot path, and diff output path. Should return {match: true} if screenshots are identical.
 */

/**
 * @typedef {Object} Plugin
 * @property {function(import('./test.js').Test): void|Promise<void>} apply - Hook into the test lifecycle by attaching event listeners
 */

/**
 * @typedef {function(import('./test.js').Test): void|Promise<void>|Plugin} PluginFunction
 */

/**
 * @typedef {Object} TestConfig
 * @property {number} [timeout] - Default timeout for all tests (in milliseconds)
 * @property {boolean} [debug] - Enable debug mode for additional logging
 * @property {number|boolean} [autorun] - Automatically run tests after this delay in milliseconds (set to 0 or false to disable)
 * @property {string|string[]} [require] - Test file paths or glob patterns to load (e.g., "./tests/**\/*.test.js")
 * @property {string} [config] - Path to a configuration file to load
 * @property {string|BrowserConfig|Array<string|BrowserConfig>} [browser] - Launch a browser for testing (e.g., "Chrome", {name: "Firefox", width: 800})
 * @property {Array<string|BrowserConfig>} [browsers] - Launch multiple browsers for testing
 * @property {string|Array<string|Object>|Object<string, string>} [serve] - Files and directories to serve over HTTP for browser tests
 * @property {ScreenshotConfig} [screenshots] - Configure screenshot capture and comparison
 * @property {string|Array<string|Function>|Function} [reporter] - Test reporter (e.g., "spec", "tap", "dot") or custom reporter function
 * @property {string|Array<string|Function>|Function} [reporters] - Multiple test reporters to use simultaneously
 * @property {Array<PluginFunction|Plugin>} [plugins] - Extend functionality with plugins (either functions or objects with an apply method)
 */

/**
 * @typedef {import('./context.js').TestContext} BaseTestContext
 * @typedef {import('./context.js').TestSuiteContext} TestSuiteContext
 */

/**
 * Get or set the timeout for the current test
 * @callback TimeoutFn
 * @param {number} [ms] - New timeout in milliseconds, or omit to get current timeout
 * @returns {number|undefined} Current timeout when called without arguments
 */

/**
 * @typedef {Object} ScreenshotOptions
 * @property {string} [name] - Screenshot name
 * @property {string|string[]} [prefix] - Prefix parts for the screenshot filename
 * @property {string} [format] - Image format (png or jpeg)
 * @property {number} [quality] - Image quality (0-100, for jpeg format)
 * @property {Object} [clip] - Area to capture {x, y, width, height}
 */

/**
 * Capture a screenshot of the current page (only available in browser tests)
 * @callback ScreenshotFn
 * @param {string|ScreenshotOptions} [name] - Screenshot name or options object
 * @param {ScreenshotOptions} [options] - Screenshot options
 * @returns {Promise<void>}
 */

/**
 * Test context with additional methods added at runtime
 * @typedef {BaseTestContext & {
 *   timeout: TimeoutFn,
 *   screenshot?: ScreenshotFn
 * }} TestContext
 */

/**
 * Function that runs a test, receives a context object with utilities like timeout(), screenshot(), etc.
 * @callback TestFn
 * @param {TestContext} t - Context object providing access to test utilities and state
 * @returns {void|Promise<void>}
 */

/**
 * Function that sets up a test suite by defining nested tests and suites
 * @callback TestSuiteFn
 * @param {TestSuiteContext} [ctx] - Context object for the suite
 * @returns {void|Promise<void>}
 */

import {
  TestSuite
} from './test.js';
import {
  autorun,
  coverage,
  captureConsole,
  devtools,
  remoteSync,
  reporterResolver
} from './plugin/index.js';

const root = new TestSuite({
  name: '<root>',
  remote: getRemoteVar(),
  plugins: [
    autorun(),
    coverage(),
    remoteSync(),
    captureConsole(),
    reporterResolver(),
    globalThis.window && devtools()
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

  let loc = new URL(globalThis.location.href);
  remote = loc.searchParams.get(kRemote);
  loc.searchParams.delete(kRemote);

  if (remote) globalThis.history.replaceState({}, '', loc);
  remote ??= globalThis.sessionStorage.getItem(kRemote);
  globalThis.sessionStorage.setItem(kRemote, remote);
  globalThis[kRemote] = remote;
  return remote;
}

/**
 * Group related tests together in a test suite
 * @param {string} name - Descriptive name for this suite
 * @param {TestOptions} [options] - Configuration options
 * @param {TestSuiteFn} [fn] - Function containing nested tests and suites
 * @returns {import('./test.js').TestSuite}
 */
export const describe = callInParentContext('describe');

/**
 * Define a test case
 * @param {string} name - Descriptive name for what this test does
 * @param {TestOptions} [options] - Configuration options
 * @param {TestFn} [fn] - Test function that runs assertions
 * @returns {import('./test.js').Test}
 */
export const test = callInParentContext('test');

/**
 * Define a test case (alias for test)
 * @param {string} name - Descriptive name for what this test does
 * @param {TestOptions} [options] - Configuration options
 * @param {TestFn} [fn] - Test function that runs assertions
 * @returns {import('./test.js').Test}
 */
export const it = callInParentContext('test');

/**
 * Run setup code before tests in the current suite
 * @param {TestOptions} [options] - Configuration options
 * @param {TestFn} [fn] - Setup function to run once before tests
 * @returns {import('./test.js').TestHook}
 */
export const before = callInParentContext('before');

/**
 * Run cleanup code after tests in the current suite
 * @param {TestOptions} [options] - Configuration options
 * @param {TestFn} [fn] - Cleanup function to run once after tests
 * @returns {import('./test.js').TestHook}
 */
export const after = callInParentContext('after');

/**
 * Run setup code before each test in the current suite
 * @param {TestOptions} [options] - Configuration options
 * @param {TestFn} [fn] - Setup function to run before every test
 * @returns {import('./test.js').TestHook}
 */
export const beforeEach = callInParentContext('beforeEach');

/**
 * Run cleanup code after each test in the current suite
 * @param {TestOptions} [options] - Configuration options
 * @param {TestFn} [fn] - Cleanup function to run after every test
 * @returns {import('./test.js').TestHook}
 */
export const afterEach = callInParentContext('afterEach');

/**
 * Configure the test harness with options like browsers, reporters, and timeouts
 * @param {TestConfig} config - Configuration options
 * @returns {Promise<void>}
 */
export function configure(config) {
  return root.configure(config);
}

/**
 * Manually start running tests (useful when autorun is disabled)
 * @param {Object} [options] - Run options
 * @returns {Promise<void>}
 */
export function run(options) {
  return root.run(options);
}

/**
 * Stop test execution immediately
 * @param {string|Error} [reason] - Why tests are being aborted
 * @returns {Promise<void>}
 */
export function abort(reason) {
  return root.abort(reason);
}
