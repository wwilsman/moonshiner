import { fork } from 'node:child_process';
import { before } from '../lib/harness.js';

before(async test => {
  await test.connect(() => [1, 2].map(() =>
    fork('./tests/harness.test.js', {
      env: { ...process.env, __MOONSHINER_REMOTE__: 'process' },
      silent: true
    })));
});
