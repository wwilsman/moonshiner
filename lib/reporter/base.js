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
  #stop; #next;

  configure(config) {
    if (config.reporter?.output != null)
      this.output = config.reporter.output;
  }

  #write(msg) {
    if (typeof this.output === 'function') this.output(msg);
    else if (typeof this.output?.write === 'function') this.output.write(msg);
    else if (globalThis.process) globalThis.process.stdout.write(msg);
    else if (globalThis.console) globalThis.console.log(msg.replace(/\n$/, ''));
  }

  async apply(test) {
    test.on('*', (event, data = {}) => {
      if (this.#stop) return;

      if (event === 'test:start') {
        Promise.resolve().then(async () => {
          let report = this.report(this.#source());
          let done, value;

          while (!done) {
            ({ done, value } = await report.next(value));
            if (value != null) this.#write(value);
          }
        });
      }

      if (event === 'test:end')
        this.#stop = true;

      return new Promise(resolve => {
        this.#events.push({ type: event, data, resolve });
        this.#next?.();
      });
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
