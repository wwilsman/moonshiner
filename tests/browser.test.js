import { describe, it, configure } from '../lib/harness.node.js';

describe('merges unique tests', () => {
  it('should report once', () => {
    console.log('[process] running');
  });
});

configure({
  // debug: true,
  // browser: 'Chrome',
  // browser: 'Firefox',
  browsers: ['Chrome', 'Firefox'],
  // browser: { name: 'Chrome'/*, ...options */ },
  // browser: { names: ['Chrome', 'Firefox']/*, ...options */ },
  // browsers: [{ name: 'Chrome'/*, ...options */ }, { name: 'Firefox'/*, ...options */ }],
  server: {
    serve: ['.', {
      '/index.html': `
        <!doctype html>
        <html lang="en">
        <body>
          <script type="module">
            import { describe, it } from '/lib/harness.js';

            it('runs from the browser', () => {
              console.log('running');
            });

            describe('merges unique tests', () => {
              it('should report once', () => {});
              it('should report skipped');

              it(sessionStorage.getItem('__MOONSHINER_REMOTE__'), async () => {
                await DevTools.send('Emulation.setDeviceMetricsOverride', {
                  width: 400, height: 0, deviceScaleFactor: 0, mobile: true
                });
              });
            });

            if (!sessionStorage.getItem('reloaded')) setTimeout(() => {
              sessionStorage.setItem('reloaded', true);
              location.reload();
            }, 500);
          </script>
        </body>
        </html>`
    }]
  }
});
