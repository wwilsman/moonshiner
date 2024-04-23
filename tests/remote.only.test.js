import { fork } from 'node:child_process';
import { configure } from 'moonshiner';

configure({
  captureConsole: false,
  plugins: [
    test => test.trigger('remote:connect', {
      connection: () => [1, 2].map(() =>
        fork('./tests/only.test.js', {
          env: { __MOONSHINER_REMOTE__: 'process' }
        }))
    })
  ]
});
