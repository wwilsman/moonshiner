import { use } from '../lib/harness.js';
import { server } from '../lib/server.js';
import { Firefox } from '../lib/browser/firefox.js';
import { Chrome } from '../lib/browser/chrome.js';

use(server({
  debug: true,
  serve: [{
    '/index.html': `
      <!doctype html>
      <html lang="en">
      <body>
        <script type="module">
          import { autorun, describe, it } from '/lib/harness.js';

          it('runs from the browser', () => {});

          describe('merges unique tests', () => {
            it('should report once', () => {});
            it('should report skipped');

            it('reports remote ' + location.search, async () => {
              await DevTools.send('Emulation.setDeviceMetricsOverride', {
                width: 400, height: 0, deviceScaleFactor: 0, mobile: true
              });
            });
          });

          if (!location.search.includes('&reloaded')) setTimeout(() => {
            location.assign(location.search + '&reloaded');
          }, 500);
        </script>
      </body>
      </html>`
  }, '.']
}));

use(test => {
  test.hook('before', async ({ signal }) => {
    let options = { server: test.server, debug: true, signal };
    let firefox = new Firefox(options);
    let chrome = new Chrome(options);

    await firefox.install();
    await chrome.install();

    await Promise.all([
      firefox.launch(`?firefox=${firefox.id}`),
      chrome.launch(`?chrome=${chrome.id}`)
    ]);
  }, { timeout: 0 });
});
