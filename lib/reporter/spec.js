import { Reporter } from './base.js';
import { style, indent } from '../util/string.js';

export class SpecReporter extends Reporter {
  #symbols = {
    'test:start': '🚀 ',
    'test:skip': '💤 ',
    'test:pass': '✅ ',
    'test:fail': '❌ ',
    'test:summary': '🏁 ',
    'test:remaining': '🚧 '
  };

  #colors = {
    'test:skip': 'blue',
    'test:pass': 'green',
    'test:fail': 'red',
    'test:remaining': 'yellow'
  };

  configure(config) {
    if (config.reporter?.symbols != null)
      Object.assign(this.#symbols, config.reporter.symbols);

    if (config.reporter?.colors != null)
      Object.assign(this.#colors, config.reporter.colors);

    return super.configure(config);
  }

  async *report(source) {
    let logs = new Map();
    let previous;

    for await (let { type, data } of source) {
      if (type === 'test:start')
        yield `\n${this.#symbols[type]}${style('white', 'Running tests')}\n`;

      if (type === 'test:ready' && data.test.type === 'suite' && data.test.depth) {
        if (!previous || previous.type === 'test') yield '\n';
        yield `${indent(data.test.depth, style('white', data.test.name))}\n`;
        previous = data.test;
      }

      if (data.test?.parent?.type !== 'test' && (
        (type === 'test:skip' && data.test.type === 'test') ||
        (type === 'test:pass' && data.test.type === 'test') ||
        (type === 'test:fail' && data.test.type !== 'suite'))) {
        if (!previous || previous.depth > data.test.depth) yield '\n';
        yield this.#formatResults(data, logs.get(data.test.id));
        previous = data.test;
      }

      if (type === 'test:log') {
        let grouped = logs.get(data.test?.id) ?? new Map();
        logs.set(data.test?.id, grouped);
        let cache = grouped.get(data.origin) ?? [];
        grouped.set(data.origin, cache);
        cache.push(data);
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

  #formatResults({ test, pass, fail, children }, logs) {
    let type = `test:${pass ? 'pass' : fail ? 'fail' : 'skip'}`;

    let symbol = this.#symbols[type];
    let styled = style(this.#colors[type], test.name);
    let results = indent(test.depth, `${symbol}${styled}\n`);

    for (let child of children ?? [])
      results += this.#formatResults(child);

    if (logs?.size) {
      let sorted = Array.from(logs).sort((a, b) => {
        return a[0] && b[0] ? a[0].localeCompare(b[0]) : (a[0] ? 1 : -1);
      });

      for (let [origin, group] of sorted) {
        if (logs.size > 1) {
          let heading = style('cyan', 'console:');
          if (origin) heading += ` ${style('yellow', origin)}`;
          results += indent(test.depth + 1, `${heading}\n`);
        }

        for (let log of group) {
          let depth = test.depth + (logs.size > 1 ? 2 : 1);
          let prefix = style('dim', `[${log.type.toUpperCase()}]`)
          results += indent(depth, `${prefix} ${log.args.join(' ')}\n`);
        }
      }
    }

    return results;
  }
}

export function specReporter() {
  return new SpecReporter();
}

Reporter.register('spec', SpecReporter);
