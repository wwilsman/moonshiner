import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import rimraf from 'rimraf';
import spawn from 'cross-spawn';

import log from '../logger.js';
import deferred from '../utils/deferred.js';
import launch from '../middlewares/launch.js';
import download from './download.js';

export function createBrowserLauncher({ ...options }) {
  return (url, launchOptions) => launch(async server => {
    if (typeof url !== 'string')
      [url, launchOptions] = [launchOptions, url];

    let browser = { name: 'browser', headless: true };
    Object.assign(browser, options, launchOptions);
    url = server.address(url);

    // download the browser as necessary
    if (!launchOptions?.executablePath)
      browser = await download(browser);
    // check if any provided executable exists
    else if (!fs.existsSync(launchOptions.executablePath))
      throw new Error(`Browser executable not found: ${launchOptions.executablePath}`);

    // create a temporary profile directory
    browser.profile ??= await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'test-browser-')
    );

    // collect browser arguments
    let args = (browser.launchArgs?.(browser) ?? [])
      .concat(browser.args ?? [], url).flat()
      .filter((a, i, args) => a && args.indexOf(a) === i);

    // launch the browser
    log(`Launching ${browser.name}`);

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

export default createBrowserLauncher;
