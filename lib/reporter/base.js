/**
 * Base class for creating custom test reporters.
 * Extend this class and implement a report() generator method to create your own reporter.
 * @example
 * import { Reporter } from 'moonshiner/reporters';
 *
 * class MyReporter extends Reporter {
 *   async *report(events) {
 *     for await (let { type, data } of events) {
 *       if (type === 'test:pass') yield `✓ ${data.test.name}\n`;
 *       if (type === 'test:fail') yield `✗ ${data.test.name}\n`;
 *     }
 *   }
 * }
 */
export class Reporter {
  static #reporters = new Map();

  /**
   * Register a custom reporter by name so it can be used in configuration
   * @param {string} name - Name to register the reporter under
   * @param {typeof Reporter} reporter - Reporter class to register
   */
  static register(name, reporter) {
    this.#reporters.set(name, reporter);
  }

  /**
   * Resolve a reporter by name and create an instance
   * @param {string} name - Name of the reporter to resolve
   * @param {...*} args - Arguments to pass to the reporter constructor
   * @returns {Reporter}
   */
  static resolve(name, ...args) {
    let Reporter = this.#reporters.get(name);
    if (!Reporter) throw new Error(`Unknown reporter "${name}"`);
    return new Reporter(...args);
  }

  #events = [];
  #started; #stopped; #next;

  /**
   * Where to write reporter output (process.stdout or a custom function)
   * @type {NodeJS.WriteStream|Function}
   */
  output = globalThis.process
    ? globalThis.process.stdout
    : msg => console.log(msg.replace(/\n$/, ''));

  /**
   * @param {Function} [report] - Generator function that processes test events
   */
  constructor(report) {
    this.report ??= report;
  }

  /**
   * Configure the reporter with options
   * @param {Object} config - Configuration object
   */
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
