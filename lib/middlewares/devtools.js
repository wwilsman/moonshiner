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

function createScreenshotCapture(runner) {
  const deviceMetricsOptions = Object.entries({
    width: 0, height: 0, deviceScaleFactor: 0, mobile: false
  });

  const getDeviceMetricsOptions = options => {
    if (!options || !deviceMetricsOptions.some(([k]) => options[k])) return null;
    return deviceMetricsOptions.reduce((overrides, [k, value]) => {
      overrides[k] = options[k] ?? value;
      return overrides;
    }, {});
  };

  return async function captureScreenshot(name, options) {
    let setDeviceMetricsOverride = getDeviceMetricsOptions(options);
    if (setDeviceMetricsOverride) await runner.DevTools.Emulation
      .setDeviceMetricsOverride(setDeviceMetricsOverride);

    let result = await runner.DevTools.Page.captureScreenshot({
      captureBeyondViewport: options?.captureBeyondViewport ?? true
    }, { name, ...options });

    if (setDeviceMetricsOverride) await runner.DevTools.Emulation
      .clearDeviceMetricsOverride();

    return result;
  };
}

export function devtools() {
  return function middleware(event, next) {
    if (event.type === 'use') Object.assign(this, {
      DevTools: createDevToolsProxy(this),
      captureScreenshot: createScreenshotCapture(this)
    });

    return next();
  };
}

export default devtools;
