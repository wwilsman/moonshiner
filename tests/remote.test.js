import { fork } from 'node:child_process';
import { use } from '../lib/harness.js';
import { connect } from '../lib/connection.js';

use(connect(() => [1, 2].map(() => (
  fork('./tests/harness.test.js', {
    env: { ...process.env, __MOONSHINER_REMOTE__: 'process' },
    silent: true
  })
))));
