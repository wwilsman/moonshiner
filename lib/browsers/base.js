import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import rimraf from 'rimraf';
import spawn from 'cross-spawn';

import log from '../logger.js';
import hook from '../middlewares/hook.js';
import download from './download.js';

// watch the process stderr and resolve when it emits the devtools protocol address
function waitForDevTools(proc, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let stderr = '';

    let handleData = chunk => {
      stderr += (chunk = chunk.toString());
      let [, devtools] = chunk.match(/^DevTools listening on (ws:\/\/.*)$/m) ?? [];
      if (devtools) cleanup(() => resolve(devtools));
    };

    let handleExitClose = () => handleError();
    let handleError = error => cleanup(() => reject(new Error(
      `Failed to launch browser. ${error?.message ?? ''}\n${stderr}'\n\n`
    )));

    let cleanup = callback => {
      clearTimeout(timeoutId);
      proc.stderr.off('data', handleData);
      proc.stderr.off('close', handleExitClose);
      proc.off('exit', handleExitClose);
      proc.off('error', handleError);
      callback();
    };

    let timeoutId = setTimeout(() => handleError(
      new Error(`Timed out after ${timeout}ms`)
    ), timeout);

    proc.stderr.on('data', handleData);
    proc.stderr.on('close', handleExitClose);
    proc.on('exit', handleExitClose);
    proc.on('error', handleError);
  });
}

export function createBrowserLauncher({ ...options }) {
  options.name ??= 'browser';
  options.headless ??= true;

  return (url, launchOptions) => hook({
    on: e => e.type === 'server' && e.name === 'launch',
    off: e => e.type === 'server' && e.name === 'close'
  }, async () => {
    let browser = { ...options, ...launchOptions };

    // download the browser as necessary
    if (!launchOptions?.executablePath)
      browser = await download(browser);
    // check if any provided executable exists
    else if (!fs.existsSync(launchOptions.executablePath))
      throw new Error(`Browser executable not found: ${launchOptions.executablePath}`);

    // create a temporary profile directory
    let profile = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'test-browser-'));

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

    // wait until the process emits a devtools address
    await waitForDevTools(proc);

    // resolves when the browser exits
    let exited = new Promise(resolve => {
      if (!proc || proc.exitCode) resolve();
      else proc.on('exit', resolve);
    }).then(() => rimraf(profile));

    // kill the browser and return the exit promise
    return () => {
      if (proc?.pid && !proc.killed) proc.kill('SIGKILL');
      return exited;
    };
  });
}

export default createBrowserLauncher;
