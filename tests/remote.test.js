import { fork } from 'node:child_process';
import { configure } from '../lib/harness.node.js';

import './harness.test.js';

configure({
  plugins: [
    api => api.connect(() => [1, 2].map(() =>
      fork('./tests/harness.test.js', {
        env: { __MOONSHINER_REMOTE__: 'process' }
      })))
  ]
});
