export function createReporter(handler, state = {}) {
  return function reporter({ type, name, data }, next) {
    let handle = (type, name, data) => ((
      typeof handler === 'function' ? handler : handler[name]
    )?.call(this, { type, name, data }, state), data);

    if (type === 'use' && typeof state === 'function')
      state = state(this);

    if (type === 'console' || type === 'report')
      handle(type, name, data);

    if (type === 'run')
      return Promise.resolve()
        .then(() => handle('report', `before:${name}`, data))
        .then(() => next())
        .then(res => handle('report', `after:${name}`, res));

    return next();
  };
}

export default createReporter;
