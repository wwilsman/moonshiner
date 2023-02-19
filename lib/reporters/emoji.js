import createReporter from './base.js'
import { printSummary } from './summary.js';

export function reporter({
  onInfo = (...a) => console.log(...a),
  onWarn = (...a) => console.warn(...a),
  onError = (...a) => console.error(...a.map(
    error => error.stack ?? error.message ?? error))
} = {}) {
  return createReporter({
    'console:log': args => onInfo(...args),
    'console:warn': args => onWarn(...args),
    'console:error': args => onError(...args),

    'before:suite': suite => (
      suite.depth && onInfo('\n' + '  '.repeat(suite.depth) + suite.name)),
    'after:suite': suite => (
      suite.depth === 0 && printSummary(suite, { onInfo, onError })),
    'after:test': test => {
      let emoji = test.error ? "❌ " : test.success ? "✅ " : "💤 ";
      onInfo('  '.repeat(test.suite.depth + 1) + emoji + test.name);
    }
  });
}

export default reporter;
