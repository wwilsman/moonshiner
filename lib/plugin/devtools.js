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
    let api;

    test.on('remote:event', ({ event }) => {
      if (event === 'devtools:enable') {
        api = globalThis.DevTools = {
          send: (method, params, meta) =>
            test.trigger('devtools:send', {
              method, params, meta
            })
        };
      }
    });

    test.define('screenshot', function screenshot(name, options) {
      if (!api) throw new Error('DevTools unavailable');
      if (!options && typeof name !== 'string') [options, name] = [name];
      let [captureParams, meta] = getCaptureScreenshotParams(options);
      name ||= meta?.name || this.path.concat(this.name).join(' | ');

      return api.send('Page.captureScreenshot', {
        captureBeyondViewport: true, ...captureParams
      }, { ...meta, name });
    });
  }
}

export function devtools() {
  return new DevTools();
}
