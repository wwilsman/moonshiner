import { Reporter } from './base.js';
import { style } from '../util/string.js';

export class DotReporter extends Reporter {
  #symbols = {
    'test:skip': ',',
    'test:pass': '.',
    'test:fail': '!'
  };

  #colors = {
    'test:skip': 'blue',
    'test:pass': 'green',
    'test:fail': 'red'
  };

  configure(config) {
    if (config.reporter?.symbols != null)
      Object.assign(this.#symbols, config.reporter.symbols);

    if (config.reporter?.colors != null)
      Object.assign(this.#colors, config.reporter.colors);

    return super.configure(config);
  }

  async *report(source) {
    let count = 0;

    for await (let { type, data } of source) {
      if (type === 'test:start')
        yield '\n';

      if (data.test?.parent?.type !== 'test' && (
        (type === 'test:skip' && data.test.type === 'test') ||
        (type === 'test:pass' && data.test.type === 'test') ||
        (type === 'test:fail' && data.test.type !== 'suite'))) {
        yield style(this.#colors[type], this.#symbols[type]);
        let cols = Math.max(this.output.columns ?? 20, 20);
        let newline = ++count === cols;
        if (newline) yield '\n';
        if (newline) count = 0;
      }

      if (type === 'test:end') {
        yield '\n';

        yield this.summarize(data, {
          colors: this.#colors
        });
      }
    }

    yield '\n';
  }
}

export function dotReporter() {
  return new DotReporter();
}

Reporter.register('dot', DotReporter);
