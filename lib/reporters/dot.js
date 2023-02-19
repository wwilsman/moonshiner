import createReporter from './base.js'

export function reporter({
  write = (...a) => globalThis.process?.stdout?.write(...a)
} = {}) {
  return createReporter({
    /* @todo: log above dots
    'console:log': args => log(...args),
    'console:warn': args => log.warn(...args),
    'console:error': args => log.error(...args),
    */

    'after:suite': suite => (
      suite.depth === 0 && onInfo('\n'),
    'after:test': test => (
      write(test.error ? '!' : test.success ? '.' : ','))
  });
}

export default reporter;
