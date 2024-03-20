import { Server } from './server.js';
import { resolveBrowser } from './browser/index.js';
import { configure as superConfigure, before } from './harness.js';

const harnessConfiguration = {};

export function configure({
  browser, browsers, browserUrl, server, ...config
}) {
  if (browser) browsers = [browser].concat(browsers ?? []);

  Object.assign(harnessConfiguration, {
    browserUrl, browsers, server
  });

  superConfigure(config);
}

before(async test => {
  let { server, browsers, browserUrl } = harnessConfiguration;

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
      browser.launch(browserUrl)
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
