import { describe, it, after, configure } from 'moonshiner';

describe('merges unique tests', () => {
  it('reports once', t => {
    console.log('running', t.timeout());
  });
});

configure({
  timeout: 10_000,

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
            it('reports once', t => {
              console.log('running', t.timeout());
            });

            it('reports skipped');

            it('takes a screenshot', async t => {
              await t.screenshot();
            });

            it('should fail for existing screenshot', async t => {
              await t.screenshot({
                prefix: 'merges unique tests',
                name: 'takes a screenshot'
              });
            });

            it('should fail for changed screenshot', async t => {
              document.getElementById('test').innerHTML = Math.random();
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
});

after(async () => {
  let screenshot = 'merges unique tests | should fail for changed screenshot.new.png';
  let { unlink } = await import('fs/promises');

  for (let browser of ['Firefox', 'Chrome', 'Chrome (mobile)'])
    await unlink(`./tests/__screenshots__/${browser}/${screenshot}`).catch(() => {});
});
