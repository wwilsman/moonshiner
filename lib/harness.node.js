import { Server } from './server.js';
import { resolveBrowser } from './browser/index.js';
import { configure as superConfigure, before } from './harness.js';

const harnessConfiguration = {};

export function configure({ browser, browsers, server, ...config }) {
  if (Array.isArray(browser?.names)) {
    let { names, ...options } = browser;
    browsers = names.map(name => ({ ...options, name }));
  } else if (browser) {
    browsers = [browser].concat(browsers ?? []);
  }

  Object.assign(harnessConfiguration, {
    browsers, server
  });

  superConfigure(config);
}

before({ timeout: 0 }, async test => {
  let { server, browsers } = harnessConfiguration;

  if (server || browsers)
    server = new Server(test, server);

  if (browsers) {
    browsers = browsers.reduce((browsers, browser) =>
      browsers.concat(resolveBrowser(browser, server) ?? []), []);
    for (let browser of browsers) await browser.install();
  }

  if (server)
    await server.start();

  if (browsers)
    await Promise.all(browsers.map(browser => browser.launch()));
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
