import { indent } from '../util/indent.js';

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
    if (globalThis.window) console.log(msg);
    else globalThis.process.stdout.write(msg);
  };

  let report = ({ test, pass, children }) => {
    let e = emoji(test.skip ? 'skip' : pass ? 'pass' : 'fail');
    write(indent(test.depth, `${e} ${test.name}`) + '\n');

    for (let child of children ?? [])
      if (child.pass || child.fail || child.test.skip) report(child);
  };

  return async function*(events) {
    for await (let { type, data } of events) {
      if (type === 'test:plan' && data.test.type === 'suite' && data.test.depth)
        write(indent(data.test.depth, data.test.name) + '\n');

      if (data.test.parent?.type !== 'test' && (
        (type === 'test:plan' && data.test.type === 'test' && data.test.skip) ||
        (type === 'test:pass' && data.test.type === 'test') ||
        (type === 'test:fail' && data.test.type !== 'suite')
      )) report(data);

      if (type === 'run:end') {
        (function printError({ test, error, children, hooks }) {
          if (error && test.type !== 'suite')
            console.error(`${test.id}\n${indent(1, error.stack)}`);
          for (let hook of hooks?.before ?? []) printError(hook);
          for (let hook of hooks?.beforeEach ?? []) printError(hook);
          for (let child of children ?? []) printError(child);
          for (let hook of hooks?.afterEach ?? []) printError(hook);
          for (let hook of hooks?.after ?? []) printError(hook);
        })(data);
      }
    }
  };
}

export default emoji;
