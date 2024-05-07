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
  #started; #stopped; #next;

  output = globalThis.process
    ? globalThis.process.stdout
    : msg => console.log(msg.replace(/\n$/, ''));

  constructor(report) {
    this.report ??= report;
  }

  configure(config) {
    if (config.output != null)
      this.output = config.reporter.output;
  }

  async apply(test) {
    test.on(async (event, data) => {
      if (event === 'test:start') {
        this.#stopped = false;
        this.#started = Promise.resolve().then(async () => {
          let report = this.report(this.#source());
          let done, value;

          while (!done) {
            ({ done, value } = await report.next(value));
            if (value != null) this.#write(value);
          }
        });
      }

      let stopped = this.#stopped;

      if (event === 'test:end')
        this.#stopped = true;

      if (this.#started && !stopped) {
        await new Promise(resolve => {
          this.#events.push({ type: event, data, resolve });
          this.#next?.();
        });
      }

      if (event === 'test:end')
        await this.#started;
    });
  }

  async *#source() {
    while (true) {
      if (this.#events.length) {
        let { resolve, ...event } = this.#events.shift();
        resolve(yield event);
      } else if (!this.#stopped) {
        await new Promise(resolve => (this.#next = resolve));
      } else {
        return;
      }
    }
  }

  #write(msg) {
    if (typeof this.output === 'function')
      this.output(msg);
    else if (typeof this.output?.write === 'function')
      this.output.write(msg);
  }
}
