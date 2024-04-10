import { describe, it, configure } from 'moonshiner';

describe('merges unique tests', () => {
  it('reports once', () => {
    console.log('running');
  });
});

configure({
  // debug: true,

  browsers: [
    'Firefox',
    'Chrome',
    {
      name: 'Chrome (mobile)',
      browser: 'Chrome',
      width: 720,
      height: 1280
    }
  ],

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

            describe('merges unique tests', () => {
              it('reports once', () => {
                console.log('running');
              });

              it('reports skipped');

              it('takes a screenshot', async t => {
                await t.screenshot();
              });

              it('should fail for existing screenshot', async t => {
                await t.screenshot('takes a screenshot');
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
