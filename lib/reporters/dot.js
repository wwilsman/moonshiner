import createReporter from './base.js'

export function reporter({
  write = (...a) => globalThis.process?.stdout?.write(...a)
} = {}) {
  return createReporter({
    /* @todo: log above dots
    'console:log': ({ data }) => log(...data),
    'console:warn': ({ data }) => log.warn(...data),
    'console:error': ({ data }) => log.error(...data),
    */

    'after:suite': ({ data: { suite } }) =>
      !suite && write('\n'),
    'after:test': ({ data: { success, error } }) =>
      write(success ? '.' : error ? '!' : ',')
  });
}

export default reporter;
