import { Reporter } from './base.js';
import { style, indent } from '../util/string.js';

export class SpecReporter extends Reporter {
  #started = false;

  #symbols = {
    'test:start': '🚀 ',
    'test:skip': '💤 ',
    'test:pass': '✅ ',
    'test:fail': '❌ '
  };

  #colors = {
    'test:skip': 'blue',
    'test:pass': 'green',
    'test:fail': 'red'
  };

  configure(config) {
    if (config.symbols != null)
      Object.assign(this.#symbols, config.symbols);

    if (config.colors != null)
      Object.assign(this.#colors, config.colors);

    return super.configure(config);
  }

  async *report(source) {
    let logs = new Map();
    let previous;

    for await (let { type, data } of source) {
      if (type === 'test:start') {
        if (!this.#started) yield '\n';
        yield `${this.#symbols[type]}${style('white', 'Running tests')}\n`;
        this.#started = true;
      }

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
        let heading = style('cyan', 'console:');
        if (origin) heading += ` ${style('yellow', origin)}`;
        results += indent(test.depth + 1, `${heading}\n`);

        for (let log of group) {
          let prefix = style('dim', `[${log.type.toUpperCase()}]`);
          results += indent(test.depth + 2, `${prefix} ${log.args.join(' ')}\n`);
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
