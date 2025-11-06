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

  get name() {
    return this.#test.name;
  }

  get path() {
    return this.#test.path;
  }

  get signal() {
    return this.#signal;
  }

  test(name, options, fn) {
    let test = this.#test.test(name, options, fn);
    return test.run();
  }

  before(fn, options) {
    let hook = this.#test.before(options, fn);
    return hook.run();
  }

  after(fn, options) {
    this.#test.after(options, fn);
  }

  beforeEach(fn, options) {
    this.#test.beforeEach(options, fn);
  }

  afterEach(fn, options) {
    this.#test.afterEach(options, fn);
  }
}

export class TestSuiteContext {
  #suite; #signal;

  constructor(suite, signal) {
    this.#suite = suite;
    this.#signal = signal;
  }

  get name() {
    return this.#suite.name;
  }

  get signal() {
    return this.#signal;
  }
}
