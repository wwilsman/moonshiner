import { style, indent, formatTime } from '../util/string.js';

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

  summarize(data, {
    symbols = {},
    colors = {}
  } = {}) {
    let summary = '';

    if (data.fail)
      summary += `\n${symbols['test:fail'] ?? ''}${style(colors['test:fail'], 'Failed')}\n`;

    for (let { test, error } of this.errors(data)) {
      summary += '\n';

      if (test.parent) {
        summary += (test.parent?.parent ? (function title({ name, depth, parent }) {
          let parents = parent?.parent ? `${title(parent)}` : '';
          return `${parents}${indent(depth, style('white', name))}\n`;
        })(test.parent) : '') + (
          `${indent(test.depth, style(colors['test:fail'], test.name))}\n`
        );
      }

      if (error && error.name && error.message) {
        let stack = error.stack?.split(error.message + '\n').at(-1) ?? '';
        stack &&= style('dim', indent(1, stack.split('\n').map(l => l.trim()).join('\n')));
        stack &&= error.message.includes('\n\n') ? `\n\n${stack}` : `\n${stack}`;
        error = `${error.name}: ${error.message.trim()}${stack}`;
      }

      summary += `${indent(test.depth + 1, error)}\n`;
    }

    let passing = style(colors['test:pass'], `${data.total.passing} passing`);
    let skipped = style(colors['test:skip'], `${data.total.skipped} skipped`);
    let failing = style(colors['test:fail'], `${data.total.failing} failing`);
    let remains = style(colors['test:remaining'], `${data.total.remaining} remaining`);
    let duration = style('dim', ` (${formatTime(data.timing.duration)})`);
    if (data.timing.duration < 1000) duration = '';

    summary += `\n${symbols['test:summary'] ?? ''}${style('white', 'Summary')}\n`;
    summary += '\n' + indent(1, `${symbols['test:pass'] ?? ''}${passing}${duration}\n`);
    if (data.total.skipped) summary += indent(1, `${symbols['test:skip'] ?? ''}${skipped}\n`);
    if (data.total.failing) summary += indent(1, `${symbols['test:fail'] ?? ''}${failing}\n`);
    if (data.total.remaining) summary += indent(1, `${symbols['test:remaining'] ?? ''}${remains}\n`);

    return summary;
  }

  errors({ test, error, children, hooks }) {
    let errors = [];

    if (error)
      errors.push({ test, error });

    for (let next of [].concat(
      hooks?.before ?? [],
      hooks?.beforeEach ?? [],
      children ?? [],
      hooks?.afterEach ?? [],
      hooks?.after ?? []
    )) errors.push(...this.errors(next));

    return errors;
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
