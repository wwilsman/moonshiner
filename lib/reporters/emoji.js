import log from 'moonshiner/logger';
import createReporter from './base.js';
import { printSummary } from './summary.js';
import { indent } from '../utils.js';

export function reporter({
  write = log.write,
  emojis
} = {}) {
  return createReporter({
    // @todo: associate logs with tests?
    'console:log': args => write(args.concat('\n')),
    'console:warn': args => write(args.concat('\n'), 'warn'),
    'console:error': args => write(args.concat('\n'), 'error'),

    'before:suite': suite =>
      suite.depth && write('\n' + indent(suite.depth, suite.name) + '\n'),
    'after:suite': suite => (
      suite.depth === 0 && printSummary(suite, { write })),
    'after:test': test => {
      let emoji = emojis?.skip ?? '💤';
      if (test.error) emoji = emojis?.error ?? '❌';
      if (test.success) emoji = emojis?.success ?? '✅';
      write(indent(test.suite.depth + 1, `${emoji} ${test.name}`) + '\n');
    }
  });
}

export default reporter;
