import { configure } from 'moonshiner';

configure({
  browser: 'Chrome',
  serve: ['.', {
    '/index.html': `
      <!doctype html>
      <html lang="en">
      <body>
        <script type="importmap">{ "imports": { "moonshiner": "/lib/harness.js" } }</script>
        <script type="module">
          import { describe, it } from 'moonshiner';

          describe('navigation close', () => {
            it('should abort when navigating away', async () => {
              // Wait for test to fully start before navigating
              await new Promise(resolve => setTimeout(resolve, 500));

              // Trigger navigation which will close the connection
              window.location.href = 'https://example.com/redirect';

              // Wait - should abort before this completes
              await new Promise(resolve => setTimeout(resolve, 5000));
            });
          });
        </script>
      </body>
      </html>`
  }]
});
