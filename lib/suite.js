import { Test } from './test.js';
import { TestSuiteContext } from './context.js';

export class TestSuite extends Test {
  #defined;

  constructor({ setup, ...options } = {}) {
    super({ fn: () => {}, ...options });
    this.type = 'suite';

    this.#defined = Promise.resolve().then(async () => {
      let ctx = new TestSuiteContext(this);
      await setup?.call(ctx, ctx);
    });
  }

  async ready() {
    await this.#defined;
    await Promise.all(this.children.map(c => c.ready?.()));
    if (this.children.some(c => c.only || c.runOnly)) this.runOnly = true;
  }

  describe(name, options, setup) {
    if (typeof setup !== 'function') [options, setup] = [setup, options];
    let suite = new TestSuite({ ...options, name, setup, parent: this });
    this.children.push(suite);
    return suite;
  }
}
