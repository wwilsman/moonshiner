import { configure } from 'moonshiner';

configure({
  browser: 'Chrome',
  serve: ['.', {
    '/index.html': `
      <!doctype html>
      <html lang="en">
      <body>
        <script type="importmap">{ "imports": { "moonshiner": "/lib/harness.js" } }</script>
        <script type="module" src="/tests/abort.test.js"></script>
      </body>
      </html>`
  }]
});
