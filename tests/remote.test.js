import { fork } from 'node:child_process';
import { configure } from 'moonshiner';

configure({
  require: './tests/harness.test.js',
  plugins: [
    test => test.trigger('remote:connect', {
      connection: () => [1, 2].map(() =>
        fork('./tests/harness.test.js', {
          env: { __MOONSHINER_REMOTE__: 'process' }
        }))
    })
  ]
});
