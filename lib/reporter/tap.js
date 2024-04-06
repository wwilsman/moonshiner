import { Reporter } from './base.js';
import { indent } from '../util/string.js';

const NEWLINE_RE = /\n|\r\n/;

export class TapReporter extends Reporter {
  async *report(source) {
    yield 'TAP version 13\n';

    for await (let { type, data } of source) {
      if (data?.test?.type === 'hook') continue;

      if (type === 'test:plan' && data.test.parent)
        yield indent(data.test.depth - 1, `# Subtest: ${this.#escape(data.test.name)}\n`);

      if (type === 'test:pass' || type === 'test:fail') {
        if (data.children.length)
          yield indent(data.test.depth, `1..${data.children.length}\n`);

        if (data.test.parent)
          yield this.#formatResults(data);
      }
    }
  }

  #formatResults({ test, fail, error, duration }) {
    let results = `${fail ? 'not ' : ''}ok ${test.index + 1}`;
    if (test.name) results += ` - ${this.#escape(test.name)}`;
    if (test.skip) results += ' # SKIP';
    results += '\n';

    results += indent(1, [
      '---\n',
      this.#formatYamlValue('duration', duration.toFixed(3)),
      this.#formatYamlValue('error', error),
      '...\n'
    ].join(''));

    return indent(test.depth - 1, results);
  }

  #escape(input) {
    return input.replace('\b', '\\b')
      .replace('\f', '\\f')
      .replace('\t', '\\t')
      .replace('\n', '\\n')
      .replace('\r', '\\r')
      .replace('\v', '\\v')
      .replace('\\', '\\\\')
      .replace('#', '\\#');
  }

  #formatYamlValue(name, value) {
    if (typeof value === 'string') {
      let lines = value.split(NEWLINE_RE).map(l => l.trim());
      if (lines.length === 1) return `${name}: ${lines[0]}\n`;
      return `${name}: |-\n${indent(1, lines.join('\n'))}\n`;
    }

    if (value instanceof Error) {
      if (!value.message) return `${name}: ${value}\n`;
      let results = '';

      results += this.#formatYamlValue('name', value.name);
      results += this.#formatYamlValue('message', value.message);
      results += this.#formatYamlValue('code', value.code);

      let stack = value.stack?.split(value.message + '\n').at(-1);
      results += this.#formatYamlValue('stack', stack);

      return `${name}: \n${indent(1, results)}`;
    }

    if (value != null)
      return `${name}: ${value}\n`;

    return '';
  }
}

export function tapReporter() {
  return new TapReporter();
}

Reporter.register('tap', TapReporter);
