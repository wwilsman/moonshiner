import log from 'moonshiner/logger';
import createReporter from './base.js';
import { printSummary } from './summary.js';
import { indent } from '../utils.js';

export function reporter({ write = log.write } = {}) {
  return createReporter({
    'console:log': args => write(args),
    'console:warn': args => write(args, 'warn'),
    'console:error': args => write(args, 'error'),

    'before:suite': suite => suite.depth
      ? write('\n' + indent(suite.depth, suite.name) + '\n')
      : write('\n'),
    'after:suite': suite => (
      suite.depth === 0 && printSummary(suite, { write })),
    'after:test': test => {
      let emoji = test.error ? '❌' : test.success ? '✅' : '💤';
      write(indent(test.suite.depth + 1, `${emoji} ${test.name}`) + '\n');
    }
  });
}

export default reporter;
