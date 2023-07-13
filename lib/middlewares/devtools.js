function createDevToolsProxy(runner) {
  let uid = 0;

  let send = (method, params, meta) =>
    runner.send?.({
      id: ++uid,
      type: 'server',
      name: 'devtools:send',
      data: { method, params, meta },
      devtools: globalThis.__MOONSHINER_DEVTOOLS_URL__
    });

  return new Proxy(send, {
    get: (devtools, name) => {
      let domain = (method, ...args) => devtools(`${name}.${method}`, ...args);
      let method = (domain, method) => (...args) => domain(method, ...args);
      return new Proxy(domain, { get: method });
    }
  });
}

export function devtools() {
  return function middleware(event, next) {
    if (event.type === 'use') Object.assign(this, {
      DevTools: createDevToolsProxy(this),
    });

    return next();
  };
}

export default devtools;
