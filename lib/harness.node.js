import {
  configure
} from './harness.js';
import {
  server,
  browserResolver,
  screenshot
} from './plugin/index.node.js';

configure({
  plugins: [
    server(),
    browserResolver(),
    screenshot()
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
  run
} from './harness.js';
