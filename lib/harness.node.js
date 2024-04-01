import {
  configure
} from './harness.js';
import {
  server,
  remoteSync,
  browserResolver,
} from './plugin/index.node.js';

configure({
  plugins: [
    server(),
    remoteSync(),
    browserResolver(),
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
