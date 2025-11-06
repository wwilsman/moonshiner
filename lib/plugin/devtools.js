const captureScreenshotParams = new Set([
  'clip', 'format', 'quality', 'origin',
  'captureBeyondViewport', 'fromSurface', 'optimizeForSpeed'
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

    test.on('connection:event', ({ event, data }) => {
      if (event === 'devtools:enable') {
        api = globalThis.DevTools = {
          bidi: data.bidi,
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

      let [captureParams, meta] = getCaptureScreenshotParams({
        prefix: this.path, name, ...options
      });

      if (api.bidi)
        return api.send('browsingContext.captureScreenshot', {
          context: api.bidi.context, ...captureParams
        }, meta);

      return api.send('Page.captureScreenshot', {
        captureBeyondViewport: true, ...captureParams
      }, meta);
    });
  }
}

export function devtools() {
  return new DevTools();
}
