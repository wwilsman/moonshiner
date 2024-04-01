const captureScreenshotParams = new Set([
  'clip', 'format', 'quality', 'captureBeyondViewport',
  'fromSurface', 'optimizeForSpeed'
]);

function getCaptureScreenshotParams(options) {
  return options ? Object.entries(options)
    .reduce(([capture, other], [key, value]) => {
      if (captureScreenshotParams.has(key))
        (capture ??= {})[key] = value;
      else if (value != null)
        (other ??= {})[key] = value;
      return [capture, other];
    }, []) : [];
}

export class DevTools {
  apply(test) {
    test.on('remote:event', event => {
      if (event === 'devtools:enable') {
        let DevTools = globalThis.DevTools = {
          send: (method, params, meta) =>
            test.emit('devtools:send', {
              method, params, meta
            })
        };

        test.define('screenshot', function screenshot(name, options) {
          if (!options && typeof name !== 'string') [options, name] = [name];
          let [captureParams, meta] = getCaptureScreenshotParams(options);
          meta = { ...meta, name: name || meta?.name || this.name };

          return DevTools.send('Page.captureScreenshot', {
            captureBeyondViewport: true, ...captureParams
          }, meta);
        });
      }
    });
  }
}

export function devtools() {
  return new DevTools();
}
