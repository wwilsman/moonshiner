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
        yield* this.#reportTest(data);
        previous = data.test;
      }

      if (type === 'test:end') {
        if (data.fail) yield `\n${this.#symbols['test:fail']}${style('red', 'Failed')}\n`;
        yield* this.#reportError(data);

        let passing = style(this.#colors['test:pass'], data.total.passing + ' passing');
        let skipped = style(this.#colors['test:skip'], data.total.skipped + ' skipped');
        let failing = style(this.#colors['test:fail'], data.total.failing + ' failing');
        let duration = style('dim', ` (${formatTime(data.duration)})`);
        if (data.duration < 1000) duration = '';

        yield `\n${this.#symbols[type]}${style('white', 'Summary')}\n`;
        yield '\n' + indent(1, `${this.#symbols['test:pass']}${passing}${duration}\n`);
        if (data.total.skipped) yield indent(1, `${this.#symbols['test:skip']}${skipped}\n`);
        if (data.total.failing) yield indent(1, `${this.#symbols['test:fail']}${failing}\n`);
      }
    }

    yield '\n';
  }

  *#reportTest({ test, pass, fail, children }) {
    let type = `test:${pass ? 'pass' : fail ? 'fail' : 'skip'}`;

    let symbol = this.#symbols[type];
    let styled = style(this.#colors[type], test.name);
    yield indent(test.depth, `${symbol}${styled}\n`);

    for (let child of children ?? []) {
      if (child.pass || child.fail || child.skip)
        yield* this.#reportTest(child);
    }
  }

  *#reportError({ test, error, children, hooks }) {
    let getParentNames = t =>
      (t.parent?.parent ? `${getParentNames(t.parent)}\n` : '') +
      `${indent(t.depth, style('white', t.name))}\n`;

    if (error) {
      yield '\n';

      if (test.parent) {
        yield getParentNames(test.parent);
        yield `${indent(test.depth, style('red', test.name))}\n`;
      }

      if (error instanceof Error) {
        let stack = error.stack.split(error.message + '\n').at(-1);
        stack = indent(1, stack.split('\n').map(l => l.trim()).join('\n'));
        error = `${error.name}: ${error.message}\n${style('dim', stack)}`;
      }

      yield `${indent(test.depth + 1, error)}\n`;
    }

    for (let next of [].concat(
      hooks?.before ?? [],
      hooks?.beforeEach ?? [],
      children ?? [],
      hooks?.afterEach ?? [],
      hooks?.after ?? []
    )) yield* this.#reportError(next);
  }
}

export function specReporter(options) {
  return new SpecReporter(options);
}

Reporter.register('spec', SpecReporter);
