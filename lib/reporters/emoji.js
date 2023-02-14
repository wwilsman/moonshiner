import log from '../logger.js';
import createReporter from './base.js'

export function reporter() {
  return createReporter({
    'console:log': ({ data }) => log(...data),
    'console:warn': ({ data }) => log.warn(...data),
    'console:error': ({ data }) => log.error(...data),

    'before:suite': ({ data: { name, depth, suite } }) => (
      suite && log('\n' + '  '.repeat(depth) + name)),
    'after:suite': ({ data: { suite } }) =>
      !suite && log.write('\n'),
    'after:test': ({ data: { name, success, error, suite } }) => {
      let emoji = error ? "❌ " : success ? "✅ " : "💤 ";
      log('  '.repeat(suite.depth + 1) + emoji + name);
      if (error) log.error(error);
    }
  });
}

export default reporter;
