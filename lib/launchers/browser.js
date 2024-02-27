import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rimraf } from 'rimraf';
import spawn from 'cross-spawn';

import log from '../logger.node.js';
import deferred from '../utils/deferred.js';
import connectDevTools from '../utils/devtools.js';
import middlewareHook from '../middlewares/hook.js';
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
    if (server.options.debug) browser.debug = true;
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

    if (typeof browser.devtoolsPort === 'function')
      browser.devtoolsPort = await browser.devtoolsPort(browser);

    // collect unique browser launch arguments
    let args = (browser.launchArgs?.(browser) ?? [browser.args, browser.url])
      .flat().filter((a, i, args) => a && args.indexOf(a) === i);

    // launch the browser
    log.write(`Launching ${browser.name}\n`);
    let proc = spawn(browser.executablePath, args, {
      detached: process.platform !== 'win32',
      ...browser.processOptions
    });

    // print stderr if launch fails
    let stderr = '';
    proc.stderr.on('data', chunk => (stderr += chunk));

    // resolve when spawned
    let spawned = deferred();
    proc.on('spawn', spawned.resolve);
    proc.on('error', spawned.reject);
    await spawned.promise;

    // maybe connect to devtools
    if (browser.devtoolsPort) {
      let devtools = await connectDevTools(browser.devtoolsPort)
        .catch(e => Promise.reject(new Error(`${e.message}\n${stderr}\n`)));

      if (browser.consoleLogs !== false) {
        devtools.on('Runtime.consoleAPICalled', ({ type, args }) => {
          args = args.map(a => a.value ?? a.description);
          if (args.length) args[0] = `[${browser.name}] ${args[0]}`;
          console[type]?.(...args);
        });
      }

      await devtools.send('Page.enable');
      await devtools.send('Runtime.enable');

      await devtools.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.__MOONSHINER_DEVTOOLS_URL__ = ${JSON.stringify(devtools.url)};`,
        runImmediately: true
      });

      // hook up devtools handling middleware
      server.use(middlewareHook({
        on: e => e.name === 'devtools:send' && e.devtools === devtools.url
      }, async data => {
        await devtools.send(data.method, data.params)
          .then(res => (data.result = res), err => (data.error = err.message));
        if (data.error) await server.emit('server', 'devtools:error', data);
        if (data.result) await server.emit('server', 'devtools:result', data);
      }));
    }

    // resolves when the browser exits
    let exited = deferred(() => rimraf(browser.profile)
      .catch(() => { /* silently fail when temp profile is not deleted */ }));
    proc.on('exit', exited.resolve);

    // forcefully kill the browser when any server close signals are recieved
    let kill = () => (proc?.pid && !proc.killed) && proc.kill('SIGKILL');
    for (let signal of server.options.closeSignals) process.on(signal, kill);

    // on cleanup kill the browser and return the exit promise
    return () => (kill(), exited.promise);
  });
}

export function browser(url, options) {
  return createBrowserLauncher()(url, options);
}

export default browser;
