import { fork } from 'node:child_process';
import { configure } from 'moonshiner';

configure({
  plugins: [
    test => test.trigger('remote:connect', {
      remote: () => [1, 2].map(() =>
        fork('./tests/only.test.js', {
          env: { __MOONSHINER_REMOTE__: 'process' }
        }))
    })
  ]
});
