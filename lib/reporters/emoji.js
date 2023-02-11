import log from '../logger.js';
import createReporter from './base.js'

export function reporter() {
  return createReporter({
    'console:log': ({ browser, data }) =>
      log(`[${browser}]`, ...data),
    'console:warn': ({ browser, data }) =>
      log.warn(`[${browser}]`, ...data),
    'console:warn': ({ browser, data }) =>
      log.error(`[${browser}]`, ...data),
    'before:suite': ({ data: { name, depth, suite } }) =>
      suite && log('\n' + '  '.repeat(depth) + name),
    'after:suite': ({ data: { suite } }) =>
      !suite && log.write('\n'),
    'after:test': ({ data: { name, success, error, suite } }) => {
      let emoji = success ? "✅ " : error ? "❌ " : "💤 ";
      log('  '.repeat(suite.depth + 1) + emoji + name);
      if (error) log.error(error);
    }
  });
}

export default reporter;
