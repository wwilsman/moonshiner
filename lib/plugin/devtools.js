const deviceMetricsOverrideParams = new Set([
  'width', 'height', 'deviceScaleFactor', 'mobile', 'scale',
  'screenWidth', 'screenHeight', 'positionX', 'positionY',
  'dontSetVisibleSize', 'screenOrientation', 'viewport',
  'displayFeature', 'devicePosture'
]);

const captureScreenshotParams = new Set([
  'clip', 'format', 'quality', 'captureBeyondViewport',
  'fromSurface', 'optimizeForSpeed'
]);

function getCommandParams(options) {
  return Object.entries(options)
    .reduce(([override, capture, other], [key, value]) => {
      if (deviceMetricsOverrideParams.has(key))
        (override ??= {})[key] = value;
      else if (captureScreenshotParams.has(key))
        (capture ??= {})[key] = value;
      else if (value != null)
        (other ??= {})[key] = value;
      return [override, capture, other];
    }, []);
}

function getDefaultSuffix(options) {
  let suffix = [].concat(
    (options?.width || options?.height) ? [
      options.width ?? globalThis.window.innerWidth,
      options.height ?? globalThis.window.innerHeight
    ].join('x') : [],
    (options?.deviceScaleFactor
      ? `@${options.deviceScaleFactor}x` : []),
    (options?.mobile ? 'mobile' : [])
  ).join(', ');

  return suffix
    ? `(${suffix})`
    : '';
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

        test.define('screenshot', async function screenshot(name, options) {
          if (!options && typeof name !== 'string') [options, name] = [name];
          let [overrideParams, captureParams, meta = {}] = getCommandParams(options);

          meta.suffix ||= getDefaultSuffix(options);
          meta.name = [].concat(
            name || meta.name || this.name,
            meta.suffix || []
          ).join(' ');

          if (overrideParams) {
            await DevTools.send('Emulation.setDeviceMetricsOverride', {
              width: 0, height: 0, mobile: false, deviceScaleFactor: 0, ...overrideParams
            });
          }

          let result = await DevTools.send('Page.captureScreenshot', {
            captureBeyondViewport: true, ...captureParams
          }, meta);

          if (overrideParams)
            await DevTools.send('Emulation.clearDeviceMetricsOverride');

          return result;
        });
      }
    });
  }
}

export function devtools() {
  return new DevTools();
}
