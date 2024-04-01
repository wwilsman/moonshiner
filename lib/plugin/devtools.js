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
      }
    });
  }
}

export function devtools() {
  return new DevTools();
}
