import { emoji } from './emoji.js';

export {
  emoji
};

const Reporters = {
  emoji
};

export function resolveReporter(reporter, ...args) {
  if (typeof reporter !== 'string') return reporter;

  if (!Reporters[reporter])
    throw new Error(`Unknown reporter "${reporter}"`);

  return Reporters[reporter](...args);
}
