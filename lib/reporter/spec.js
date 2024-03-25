import { indent } from '../util/string.js';
import { log, color } from '../util/log.js';

const defaultEmojis = {
  start: '🚀',
  skip: '💤',
  pass: '✅',
  fail: '❌',
  summary: '🏁'
};

export function spec({ emojis } = {}) {
  emojis = { ...defaultEmojis, ...emojis };

  let printReport = ({ test, pass, children }) => {
    let emoji = emojis[test.skip ? 'skip' : pass ? 'pass' : 'fail'];
    let name = color(test.skip ? 'blue' : pass ? 'green' : 'red', test.name);
    log(indent(test.depth, `${emoji} ${name}`));

    for (let child of children ?? []) {
      if (child.pass || child.fail || child.test.skip)
        printReport(child);
    }
  };

  let printError = ({ test, error, children, hooks }) => {
    let getParentNames = t =>
      (t.parent?.parent ? getParentNames(t.parent) : '') +
      indent(t.depth, color('white', t.name));

    if (error && test.type !== 'suite') {
      log(`\n${getParentNames(test.parent)}`);
      log(indent(test.depth, color('red', test.name)));

      if (error instanceof Error) {
        let stack = error.stack.split(error.message + '\n').at(-1);
        stack = indent(1, stack.split('\n').map(l => l.trim()).join('\n'));
        error = `${error.name}: ${error.message}\n${color('dim', stack)}`;
      }

      log(indent(test.depth + 1, error));
    }

    for (let hook of hooks?.before ?? []) printError(hook);
    for (let hook of hooks?.beforeEach ?? []) printError(hook);
    for (let child of children ?? []) printError(child);
    for (let hook of hooks?.afterEach ?? []) printError(hook);
    for (let hook of hooks?.after ?? []) printError(hook);
  };

  return async function*(events) {
    let lastTest;

    for await (let { type, data } of events) {
      if (type === 'run:start')
        log(`\n${emojis.start} ${color(['white'], 'Running tests')}`);

      if (type === 'test:plan' && data.test.type === 'suite' && data.test.depth) {
        if (!lastTest || lastTest?.type === 'test') log();
        log(indent(data.test.depth, color('white', data.test.name)));
        lastTest = data.test;
      }

      if (data.test.parent?.type !== 'test' && (
        (type === 'test:plan' && data.test.type === 'test' && data.test.skip) ||
        (type === 'test:pass' && data.test.type === 'test') ||
        (type === 'test:fail' && data.test.type !== 'suite'))) {
        if (!lastTest || lastTest?.depth > data.test.depth) log();
        lastTest = data.test;
        printReport(data);
      }

      if (type === 'run:end') {
        if (data.fail) log(`\n${emojis.fail} ${color('red', 'Failed')}`);
        printError(data);

        let passing = color('green', data.total.passing + ' passing');
        let skipped = color('blue', data.total.skipped + ' skipped');
        let failing = color('red', data.total.failing + ' failing');
        let duration = color('dim', `(${data.duration}ms)`);

        log(`\n${emojis.summary} ${color('white', 'Summary')}`);
        log('\n' + indent(1, `${emojis.pass} ${passing} ${duration}`));
        if (data.total.skipped) log(indent(1, `${emojis.skip} ${skipped}`));
        if (data.total.failing) log(indent(1, `${emojis.fail} ${failing}`));
        log();
      }
    }
  };
}

export default spec;
