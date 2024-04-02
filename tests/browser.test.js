import { describe, it, configure } from '../lib/harness.node.js';

describe('merges unique tests', () => {
  it('reports once', () => {
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
          <style>
            html, body { height: 100%; margin: 0; padding; 0; font: 2rem system-ui; }
            #test { display: grid; place-content: center; height: 100%; }
          </style>
          <div id="test">Test</div>
          <script type="module">
            import { describe, it } from '/lib/harness.js';

            it('runs from the browser', () => {
              console.log('running');
            });

            describe('merges unique tests', () => {
              it('reports once', () => {});
              it('reports skipped');

              it('takes a screenshot', async t => {
                await t.screenshot();
              });

              it(sessionStorage.getItem('__MOONSHINER_REMOTE__'), () => {});
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
