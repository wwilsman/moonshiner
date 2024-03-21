import { indent } from '../util/string.js';

const defaultOptions = {
  emojis: {
    skip: '💤',
    pass: '✅',
    fail: '❌'
  }
};

export function emoji(options) {
  let emoji = name =>
    options?.emojis?.[name] ??
    defaultOptions.emojis[name];

  let write = msg => {
    if (globalThis.window) console.log(msg.replace(/\n$/, ''));
    else globalThis.process.stdout.write(msg);
  };

  let printReport = ({ test, pass, children }) => {
    let e = emoji(test.skip ? 'skip' : pass ? 'pass' : 'fail');
    write(indent(test.depth, `${e} ${test.name}`) + '\n');

    for (let child of children ?? []) {
      if (child.pass || child.fail || child.test.skip)
        printReport(child);
    }
  };

  let printNestedName = test => {
    if (test.parent && test.parent.parent)
      printNestedName(test.parent);

    write(indent(test.depth, test.name) + '\n');
  };

  let printError = ({ test, error, children, hooks }) => {
    if (error && test.type !== 'suite') {
      write('\n');
      printNestedName(test);
      let msg = error.name === 'AssertionError'
        ? error.message : error.stack;
      write(indent(test.depth + 1, msg) + '\n');
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
      if (type === 'test:plan' && data.test.type === 'suite' && data.test.depth) {
        if (!lastTest || lastTest?.type === 'test') write('\n');
        write(indent(data.test.depth, data.test.name) + '\n');
        lastTest = data.test;
      }

      if (data.test.parent?.type !== 'test' && (
        (type === 'test:plan' && data.test.type === 'test' && data.test.skip) ||
        (type === 'test:pass' && data.test.type === 'test') ||
        (type === 'test:fail' && data.test.type !== 'suite'))) {
        if (!lastTest || lastTest?.depth > data.test.depth) write('\n');
        lastTest = data.test;
        printReport(data);
      }

      if (type === 'run:end') {
        // @todo: summary
        printError(data);
        write('\n');
      }
    }
  };
}

export default emoji;
