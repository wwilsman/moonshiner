import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import rimraf from 'rimraf';
import spawn from 'cross-spawn';

import log from '../logger.node.js';
import deferred from '../utils/deferred.js';
import download from './download.js';
import launch from './hook.js';

export function browser(url, options) {
  if (typeof url !== 'string') [options, url] = [options];
  let browser = { name: 'browser', headless: true, url, ...options };

  return launch(async server => {
    browser.url = server.address(browser.url);

    // download the browser as necessary
    if (typeof options.executablePath !== 'string')
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

    // spawn the browser process detached in its own group and session
    let proc = spawn(browser.executablePath, args, {
      detached: process.platform !== 'win32'
    });

    // resolves when the browser exits
    let exited = deferred(() => rimraf(browser.profile));
    proc.on('exit', exited.resolve);

    // kill the browser and return the exit promise
    return () => {
      if (proc?.pid && !proc.killed) proc.kill('SIGKILL');
      return exited.promise;
    };
  });
}

export function createBrowserLauncher(launchOptions) {
  return function(url, options) {
    if (typeof url !== 'string') [options, url] = [url];
    return browser(url, { ...launchOptions, ...options });
  };
}

export default browser;
