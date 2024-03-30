import { Reporter } from './base.js';
import { indent, formatTime } from '../util/string.js';
import { log, color } from '../util/log.js';

export class SpecReporter extends Reporter {
  #emojis;

  constructor(options) {
    super(events => this.#reportEvents(events));

    this.#emojis = Object.assign({
      start: '🚀',
      skip: '💤',
      pass: '✅',
      fail: '❌',
      summary: '🏁'
    }, options?.emojis);
  }

  async *#reportEvents(events) {
    let previous;

    for await (let { type, data } of events) {
      if (type === 'run:start')
        log(`\n${this.#emojis.start} ${color(['white'], 'Running tests')}`);

      if (type === 'test:plan' && data.test.type === 'suite' && data.test.depth) {
        if (!previous || previous.type === 'test') log();
        log(indent(data.test.depth, color('white', data.test.name)));
        previous = data.test;
      }

      if (data.test?.parent?.type !== 'test' && (
        (type === 'test:plan' && data.test.type === 'test' && data.test.skip) ||
        (type === 'test:pass' && data.test.type === 'test') ||
        (type === 'test:fail' && data.test.type !== 'suite'))) {
        if (!previous || previous.depth > data.test.depth) log();
        this.#printReport(data);
        previous = data.test;
      }

      if (type === 'run:end') {
        if (data.fail) log(`\n${this.#emojis.fail} ${color('red', 'Failed')}`);
        this.#printError(data);

        let passing = color('green', data.total.passing + ' passing');
        let skipped = color('blue', data.total.skipped + ' skipped');
        let failing = color('red', data.total.failing + ' failing');
        let duration = color('dim', ` (${formatTime(data.duration)})`);
        if (data.duration < 1000) duration = '';

        log(`\n${this.#emojis.summary} ${color('white', 'Summary')}`);
        log('\n' + indent(1, `${this.#emojis.pass} ${passing}${duration}`));
        if (data.total.skipped) log(indent(1, `${this.#emojis.skip} ${skipped}`));
        if (data.total.failing) log(indent(1, `${this.#emojis.fail} ${failing}`));
        log();
      }
    }
  }

  #printReport({ test, pass, children }) {
    let emoji = this.#emojis[test.skip ? 'skip' : pass ? 'pass' : 'fail'];
    let name = color(test.skip ? 'blue' : pass ? 'green' : 'red', test.name);
    log(indent(test.depth, `${emoji} ${name}`));

    for (let child of children ?? []) {
      if (child.pass || child.fail || child.test.skip)
        this.#printReport(child);
    }
  }

  #printError({ test, error, children, hooks }) {
    let getParentNames = t =>
      (t.parent?.parent ? `${getParentNames(t.parent)}\n` : '') +
      indent(t.depth, color('white', t.name));

    if (error) {
      log();

      if (test.parent) {
        log(getParentNames(test.parent));
        log(indent(test.depth, color('red', test.name)));
      }

      if (error instanceof Error) {
        let stack = error.stack.split(error.message + '\n').at(-1);
        stack = indent(1, stack.split('\n').map(l => l.trim()).join('\n'));
        error = `${error.name}: ${error.message}\n${color('dim', stack)}`;
      }

      log(indent(test.depth + 1, error));
    }

    for (let next of [].concat(
      hooks?.before ?? [],
      hooks?.beforeEach ?? [],
      children ?? [],
      hooks?.afterEach ?? [],
      hooks?.after ?? []
    )) this.#printError(next);
  }
}

export function specReporter(options) {
  return new SpecReporter(options);
}

Reporter.register('spec', SpecReporter);
