import createReporter from './base.js'
import { printSummary } from './summary.js';

export function reporter({
  write = (...a) => globalThis.process?.stdout?.write(...a),
  ...options
} = {}) {
  return createReporter({
    /* @todo: log above dots
    'console:log': args => log(...args),
    'console:warn': args => log.warn(...args),
    'console:error': args => log.error(...args),
    */

    'after:suite': suite => (
      suite.depth === 0 && printSummary(suite, options)),
    'after:test': test => (
      write(test.error ? '!' : test.success ? '.' : ','))
  });
}

export default reporter;
