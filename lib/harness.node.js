import { Server } from './server.js';
import { resolveBrowser } from './browser/index.js';
import { configure as superConfigure, before } from './harness.js';

const harnessConfiguration = {};

export function configure({ url, browser, browsers, server, ...config }) {
  if (browser) browsers = [browser].concat(browsers ?? []);

  Object.assign(harnessConfiguration, {
    url, browsers, server
  });

  superConfigure(config);
}

before(async test => {
  let { url, server, browsers } = harnessConfiguration;

  if (server || browsers)
    server = new Server(test, server);

  if (browsers) {
    browsers = browsers.reduce((browsers, browser) => (
      browsers.concat(resolveBrowser(browser, server) ?? [])
    ), []);
  }

  test.timeout(0);

  for (let b of browsers)
    await b.install();

  await server.start();

  await Promise.all(
    browsers.map(browser => (
      browser.launch(url)
    )));
});

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
