import log from '../logger.js';
import createReporter from './base.js'

export function reporter() {
  return createReporter({
    /* @todo: log above dots
    'console:log': ({ browser, data }) =>
      log(`[${browser}]`, ...data),
    'console:warn': ({ browser, data }) =>
      log.warn(`[${browser}]`, ...data),
    'console:warn': ({ browser, data }) =>
      log.error(`[${browser}]`, ...data),
    */

    'after:suite': ({ data: { suite } }) =>
      !suite && log.write('\n'),
    'after:test': ({ data: { success, error } }) =>
      log.write(success ? '.' : error ? '!' : ',')
  });
}

export default reporter;
