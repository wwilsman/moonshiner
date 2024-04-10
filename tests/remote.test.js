import { fork } from 'node:child_process';
import { configure } from 'moonshiner';

import './harness.test.js';

configure({
  plugins: [
    test => test.emit('remote:connect', () =>
      [1, 2].map(() => fork('./tests/harness.test.js', {
        env: { __MOONSHINER_REMOTE__: 'process' }
      })))
  ]
});
