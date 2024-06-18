import { Reporter } from './base.js';
import { style, indent, formatTime } from '../util/string.js';

export class SummaryReporter extends Reporter {
  #symbols = {
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
    if (config.symbols != null)
      Object.assign(this.#symbols, config.symbols);

    if (config.colors != null)
      Object.assign(this.#colors, config.colors);

    return super.configure(config);
  }

  async *report(source) {
    for await (let { type, data } of source) {
      if (type === 'test:end')
        yield this.summarize(data);
    }

    yield '\n';
  }

  summarize(data, {
    symbols = this.#symbols,
    colors = this.#colors
  } = {}) {
    let summary = '';

    if (data.fail)
      summary += `\n${symbols['test:fail'] ?? ''}${style(colors['test:fail'], 'Failed')}\n`;

    for (let [test, error] of this.errors(data)) {
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

    if (data.fail) summary += '\n';
    summary += `\n${symbols['test:summary'] ?? ''}${style('white', 'Summary')}\n`;
    summary += '\n' + indent(1, `${symbols['test:pass'] ?? ''}${passing}${duration}\n`);
    if (data.total.skipped) summary += indent(1, `${symbols['test:skip'] ?? ''}${skipped}\n`);
    if (data.total.failing) summary += indent(1, `${symbols['test:fail'] ?? ''}${failing}\n`);
    if (data.total.remaining) summary += indent(1, `${symbols['test:remaining'] ?? ''}${remains}\n`);

    return summary;
  }

  errors(data, map = new Map()) {
    let { test, error, children, hooks } = data;
    if (error) map.set(test, error);

    for (let next of [].concat(
      hooks?.before ?? [],
      children ?? [],
      hooks?.after ?? []
    )) this.errors(next, map);

    return map;
  }
}

export function summaryReporter() {
  return new SummaryReporter();
}

Reporter.register('summary', SummaryReporter);
