import { Server } from './server.js';
import { resolveBrowser } from './browser/index.js';
import { configure as superConfigure, before } from './harness.js';

// @todo: successive calls should overwrite each other
export function configure(config) {
  superConfigure(config);

  before(async test => {
    test.timeout(0);

    if (config.server || config.browser || config.browsers)
      test.server = new Server(test, config.server);

    if (config.browser || config.browsers) {
      test.browsers = [].concat(config.browser ?? [], config.browsers ?? [])
        .reduce((browsers, browser) => {
          if (typeof browser === 'string') browser = { name: browser };
          return browsers.concat(resolveBrowser(browser.name, test.server, browser));
        }, []);
    }

    for (let browser of test.browsers)
      await browser.install();

    await test.server.start();
    await Promise.all(test.browsers
      .map(b => b.launch(config.url)));
  });
}

export {
  describe,
  test,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  run
} from './harness.js';
