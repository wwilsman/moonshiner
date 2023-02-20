export function middleware() {
  return function({ type, name, data }, next) {
    if (type === 'run' || name === 'suite' || data.depth === 0) {
      for (let method of ['log', 'error', 'warn']) {
        let og = console[`_${method}`] = console[method];
        console[method] = (...args) => {
          this.emit('console', method, args, args => og.apply(console, args));
        };
      }
    }

    return next();
  };
}

export default middleware;
