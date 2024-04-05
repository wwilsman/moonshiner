import { Reporter } from './base.js';
import { style, indent, formatTime } from '../util/string.js';

export class SpecReporter extends Reporter {
  #symbols = {
    'test:start': '🚀 ',
    'test:skip': '💤 ',
    'test:pass': '✅ ',
    'test:fail': '❌ ',
    'test:end': '🏁 '
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
    let previous;

    for await (let { type, data } of source) {
      if (type === 'test:start')
        yield `\n${this.#symbols[type]}${style('white', 'Running tests')}\n`;

      if (type === 'test:plan' && data.test.type === 'suite' && data.test.depth) {
        if (!previous || previous.type === 'test') yield '\n';
        yield `${indent(data.test.depth, style('white', data.test.name))}\n`;
        previous = data.test;
      }

      if (data.test?.parent?.type !== 'test' && (
        (type === 'test:skip' && data.test.type === 'test') ||
        (type === 'test:pass' && data.test.type === 'test') ||
        (type === 'test:fail' && data.test.type !== 'suite'))) {
        if (!previous || previous.depth > data.test.depth) yield '\n';
        yield this.#formatResults(data);
        previous = data.test;
      }

      if (type === 'test:end') {
        yield this.summarize(data, {
          symbols: this.#symbols,
          colors: this.#colors
        });
      }
    }

    yield '\n';
  }

  #formatResults({ test, pass, fail, children }) {
    let type = `test:${pass ? 'pass' : fail ? 'fail' : 'skip'}`;

    let symbol = this.#symbols[type];
    let styled = style(this.#colors[type], test.name);
    let results = indent(test.depth, `${symbol}${styled}\n`);

    for (let child of children ?? []) {
      if (child.pass || child.fail || child.test.skip)
        results += this.#formatResults(child);
    }

    return results;
  }
}

export function specReporter(options) {
  return new SpecReporter(options);
}

Reporter.register('spec', SpecReporter);
