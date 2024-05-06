import {
  configure
} from './harness.js';
import {
  configLoader,
  requireResolver,
  server,
  browserResolver,
  screenshotCapture,
  processHandler
} from './plugin/index.node.js';

configure({
  plugins: [
    configLoader(),
    requireResolver(),
    server(),
    browserResolver(),
    screenshotCapture(),
    processHandler()
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
