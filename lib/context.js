export class TestContext {
  #test; #context; #signal;

  constructor(test, context, signal) {
    this.#test = test;
    this.#context = context;
    this.#signal = signal;
  }

  get name() {
    return this.#test.name;
  }

  get signal() {
    return this.#signal;
  }

  test(name, options, fn) {
    let test = this.#test.test(name, options, fn);

    return test.run({
      context: this.#context,
      signal: this.#signal
    });
  }

  before(fn, options) {
    let hook = this.#test.hook('before', options, fn);

    return hook.run({
      context: this.#context,
      signal: this.#signal,
      ctx: this
    });
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

  get debug() {
    return !!this.#suite.debug;
  }

  connect(transport) {
    return this.#suite.connect(transport);
  }
}
