import { createTestHook } from '../utils.js';

export function hook(fn, options) {
  if (typeof options === 'function')
    [fn, options] = [options, fn];
  let unhook, hook = createTestHook(fn);

  return function middleware(event, next) {
    if (event.type === 'describe') return next();
    if (options?.on?.(event)) return Promise.resolve()
      .then(() => hook.call(this, event.data))
      .then(u => (unhook = u))
      .then(() => next());
    if (options?.off?.(event)) return Promise.resolve()
      .then(() => unhook?.call(this, event.data))
      .then(() => (unhook = null))
      .then(() => next());
    return next();
  };
}

export default hook;
