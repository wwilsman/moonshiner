export class Reporter {
  static #reporters = new Map();

  static register(name, reporter) {
    this.#reporters.set(name, reporter);
  }

  static resolve(name, ...args) {
    let Reporter = this.#reporters.get(name);
    if (!Reporter) throw new Error(`Unknown reporter "${name}"`);
    return new Reporter(...args);
  }

  #events = [];
  #iterator; #stop; #next;

  constructor(iterator) {
    this.#iterator = iterator;
  }

  async apply(test) {
    test.on('*', (event, data = {}) => {
      if (event === 'run:start') {
        Promise.resolve().then(async () => {
          let result, report = this.#iterator(this.#source());
          while (!result?.done) result = await report.next(result?.value);
        });
      }

      if (event === 'run:end')
        this.#stop = true;

      if (!this.#stop || event === 'run:end') {
        return new Promise(resolve => {
          this.#events.push({ type: event, data, resolve });
          this.#next?.();
        });
      }
    });
  }

  async *#source() {
    while (true) {
      if (this.#events.length) {
        let { resolve, ...event } = this.#events.shift();
        resolve(yield event);
      } else if (!this.#stop) {
        await new Promise(resolve => (this.#next = resolve));
      } else {
        return;
      }
    }
  }
}
