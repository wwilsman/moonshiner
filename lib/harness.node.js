import { configure } from './harness.js';
import { browserResolver, remote, server } from './plugin/index.node.js';

configure({
  plugins: [
    remote(),
    server(),
    browserResolver()
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
