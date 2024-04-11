import {
  configure,
  abort
} from './harness.js';
import {
  requireResolver,
  server,
  browserResolver,
  screenshotCapture
} from './plugin/index.node.js';

configure({
  plugins: [
    requireResolver(),
    server(),
    browserResolver(),
    screenshotCapture(),
    test => {
      if (!process.send) {
        process.on('SIGINT', abort);
        process.on('SIGTERM', abort);
      }

      test.on('test:end', ({ fail, total, aborted }) => {
        if (fail || total.remains) process.exitCode = 1;
        if (aborted) process.exit();
      });
    }
  ]
});

export {
  describe,
  test,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  configure,
  run,
  abort
} from './harness.js';
