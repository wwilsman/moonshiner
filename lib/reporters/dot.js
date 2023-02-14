import log from '../logger.js';
import createReporter from './base.js'

export function reporter() {
  return createReporter({
    /* @todo: log above dots
    'console:log': ({ data }) => log(...data),
    'console:warn': ({ data }) => log.warn(...data),
    'console:error': ({ data }) => log.error(...data),
    */

    'after:suite': ({ data: { suite } }) =>
      !suite && log.write('\n'),
    'after:test': ({ data: { success, error } }) =>
      log.write(success ? '.' : error ? '!' : ',')
  });
}

export default reporter;
