import createReporter from './base.js'

export function reporter({
  onInfo = (...a) => console.log(...a),
  onWarn = (...a) => console.warn(...a),
  onError = (...a) => console.error(...a.map(
    error => error.stack ?? error.message ?? error))
} = {}) {
  return createReporter({
    'console:log': ({ data }) => onInfo(...data),
    'console:warn': ({ data }) => onWarn(...data),
    'console:error': ({ data }) => onError(...data),

    'before:suite': ({ data: { name, depth, suite } }) => (
      suite && onInfo('\n' + '  '.repeat(depth) + name)),
    'after:suite': ({ data: { suite } }) =>
      !suite && onInfo('\n'),
    'after:test': ({ data: { name, success, error, suite } }) => {
      let emoji = error ? "❌ " : success ? "✅ " : "💤 ";
      onInfo('  '.repeat(suite.depth + 1) + emoji + name);
      if (error) onError(error);
    }
  });
}

export default reporter;
