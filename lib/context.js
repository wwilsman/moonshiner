export class TestContext {
  #state = {};
  #test; #signal;

  constructor(test, signal, parent) {
    this.#test = test;
    this.#signal = signal;

    return new Proxy(this, {
      get: (_, property) => {
        if (property in this) {
          let value = this[property];

          return typeof value === 'function'
            ? value.bind(this)
            : value;
        }

        if (property in this.#state)
          return this.#state[property];

        if (property in test.context)
          return test.context[property];

        return parent?.[property];
      },

      set: (_, property, value) => {
        this.#state[property] = value;
        return true;
      }
    });
  }

  get name() {
    return this.#test.name;
  }

  get signal() {
    return this.#signal;
  }

  test(name, options, fn) {
    let test = this.#test.test(name, options, fn);
    return test.run();
  }

  before(fn, options) {
    let hook = this.#test.hook('before', options, fn);
    return hook.run();
  }

  after(fn, options) {
    this.#test.hook('after', options, fn);
  }

  beforeEach(fn, options) {
    this.#test.hook('beforeEach', options, fn);
  }

  afterEach(fn, options) {
    this.#test.hook('afterEach', options, fn);
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
