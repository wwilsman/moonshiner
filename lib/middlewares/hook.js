import { createTestHook } from '../utils.js';

export function hook(fn, options) {
  if (typeof options === 'function')
    [fn, options] = [options, fn];
  let unhook, hook = createTestHook(fn);
  let { on, off } = options;

  return function middleware(event, next) {
    if (event.type === 'describe') return next();
    if (on?.(event)) return Promise.resolve()
      .then(() => hook()).then(u => (unhook = u))
      .then(() => next());
    if (off?.(event)) return Promise.resolve()
      .then(() => unhook?.()).then(() => (unhook = null))
      .then(() => next());
    return next();
  }
}

export default hook;
