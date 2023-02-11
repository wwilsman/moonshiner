export function reporter() {
  return function({ type, name, data }, next) {
    if (type === 'run' || name === 'suite' || data.depth === 0)
      for (let method of ['log', 'error', 'warn']) {
        let og = console[`_${method}`] = console[method];
        console[method] = (...args) => {
          this.emit('console', method, args, og.bind(console));
        };
      }

    return next();
  }
}

export default reporter;
