/**
 * The context object passed to every test function, providing access to test utilities and state
 */
export class TestContext {
  #state = {};
  #test; #signal;

  constructor(test, signal, parent) {
    this.#test = test;
    this.#signal = signal;

    let proxy = new Proxy(this, {
      get: (_, property) => {
        let unbind = property.startsWith('#');
        if (unbind) property = property.slice(1);
        let owner = proxy;
        let value;

        if (property in this) {
          value = this[property];
          owner = this;
        } else if (property in this.#state) {
          value = this.#state[property];
        } else if (property in test.context) {
          value = test.context[property];
        } else if (parent) {
          value = parent[`#${property}`];
        }

        if (typeof value === 'function' && !unbind)
          value = value.bind(owner);

        return value;
      },

      set: (_, property, value) => {
        this.#state[property] = value;
        return true;
      }
    });

    return proxy;
  }

  /**
   * The name of the current test
   * @type {string}
   */
  get name() {
    return this.#test.name;
  }

  /**
   * Array of parent suite names leading to this test (e.g., ["parent suite", "nested suite"])
   * @type {string[]}
   */
  get path() {
    return this.#test.path;
  }

  /**
   * AbortSignal that triggers when the test is aborted or times out
   * @type {AbortSignal}
   */
  get signal() {
    return this.#signal;
  }

  /**
   * Define and run a nested test within the current test
   * @param {string} name - Descriptive name for the nested test
   * @param {import('./test.js').TestOptions} [options] - Configuration options
   * @param {Function} [fn] - Test function
   * @returns {Promise<void>}
   */
  test(name, options, fn) {
    let test = this.#test.test(name, options, fn);
    return test.run();
  }

  /**
   * Run setup code before nested tests
   * @param {Function} fn - Setup function to run
   * @param {import('./test.js').TestOptions} [options] - Configuration options
   * @returns {Promise<void>}
   */
  before(fn, options) {
    let hook = this.#test.before(options, fn);
    return hook.run();
  }

  /**
   * Run cleanup code after nested tests
   * @param {Function} fn - Cleanup function to run
   * @param {import('./test.js').TestOptions} [options] - Configuration options
   */
  after(fn, options) {
    this.#test.after(options, fn);
  }

  /**
   * Run setup code before each nested test
   * @param {Function} fn - Setup function to run before each test
   * @param {import('./test.js').TestOptions} [options] - Configuration options
   */
  beforeEach(fn, options) {
    this.#test.beforeEach(options, fn);
  }

  /**
   * Run cleanup code after each nested test
   * @param {Function} fn - Cleanup function to run after each test
   * @param {import('./test.js').TestOptions} [options] - Configuration options
   */
  afterEach(fn, options) {
    this.#test.afterEach(options, fn);
  }
}

/**
 * The context object passed to describe/suite setup functions
 */
export class TestSuiteContext {
  #suite; #signal;

  constructor(suite, signal) {
    this.#suite = suite;
    this.#signal = signal;
  }

  /**
   * The name of the current test suite
   * @type {string}
   */
  get name() {
    return this.#suite.name;
  }

  /**
   * AbortSignal that triggers when the suite is aborted
   * @type {AbortSignal}
   */
  get signal() {
    return this.#signal;
  }
}
