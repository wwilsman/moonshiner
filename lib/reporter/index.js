import { spec } from './spec.js';

export {
  spec
};

const Reporters = {
  spec
};

export function resolveReporter(reporter, ...args) {
  if (typeof reporter !== 'string') return reporter;

  if (!Reporters[reporter])
    throw new Error(`Unknown reporter "${reporter}"`);

  return Reporters[reporter](...args);
}
