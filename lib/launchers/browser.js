import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rimraf } from 'rimraf';
import spawn from 'cross-spawn';

import log from '../logger.node.js';
import deferred from '../utils/deferred.js';
import download from './download.js';
import launch from './hook.js';

const defaultOptions = {
  name: 'browser',
  headless: true,
  width: 1280,
  height: 720
};

export function createBrowserLauncher(launchOptions) {
  return (url, options) => launch(async server => {
    if (typeof url !== 'string') [options, url] = [url];

    // gather browser options
    let browser = {
      ...defaultOptions,
      ...launchOptions,
      ...server.options.browsers,
      ...server.options[options?.optionsKey],
      ...options
    };

    // don't launch if disabled
    if (browser.disable) return;

    // parse the url according to the server address
    browser.url = server.address(url ?? browser.url);
    // disable headless mode when debugging
    if (server.options.debug) browser.headless = false;

    // download the browser as necessary
    if (typeof options?.executablePath !== 'string')
      browser = await download(browser);
    // check if any provided executable exists
    else if (!fs.existsSync(options.executablePath))
      throw new Error(`Browser executable not found: ${options.executablePath}`);

    // create a temporary profile directory
    browser.profile ??= await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'test-browser-')
    );

    // collect unique browser launch arguments
    let args = (browser.launchArgs?.(browser) ?? [browser.args, browser.url])
      .flat().filter((a, i, args) => a && args.indexOf(a) === i);

    // launch the browser
    log.write(`Launching ${browser.name}\n`);
    let proc = spawn(browser.executablePath, args);

    // resolves when the browser exits
    let exited = deferred(() => rimraf(browser.profile));
    proc.on('exit', exited.resolve);

    // kill the browser and return the exit promise
    return async () => {
      if (proc?.pid && !proc.killed) proc.kill('SIGKILL');
      await exited.promise;
    };
  });
}

export function browser(url, options) {
  return createBrowserLauncher()(url, options);
}

export default browser;
