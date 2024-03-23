import { configure } from '../lib/harness.node.js';

configure({
  browsers: [
    'Chrome',
    'Firefox'
  ],
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
