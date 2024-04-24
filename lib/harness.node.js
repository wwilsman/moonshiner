import {
  configure
} from './harness.js';
import {
  configLoader,
  requireResolver,
  server,
  browserResolver,
  screenshotCapture
} from './plugin/index.node.js';

configure({
  plugins: [
    configLoader(),
    requireResolver(),
    server(),
    browserResolver(),
    screenshotCapture(),
    test => {
      if (!process.send) {
        process.on('SIGINT', () => test.abort());
        process.on('SIGTERM', () => test.abort());
      }

      test.on('test:end', ({ fail, total }) => {
        if (fail || total.remains) process.exitCode = 1;
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
