import log from '../logger.js';
import createReporter from './base.js'

// @todo: handle multiple clients
//   each ready, build suite state combining clients
//   only log once every test client has reported
//   if running without ready, no clients
export function reporter() {
  return createReporter({
    'console:log': ({ data, client }) =>
      client?.name ? log(`[${client.name}]`, ...data) : log(...data),
    'console:warn': ({ data, client }) =>
      client?.name ? log.warn(`[${client.name}]`, ...data) : log.warn(...data),
    'console:error': ({ data, client }) =>
      client?.name ? log.error(`[${client.name}]`, ...data) : log.error(...data),
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
