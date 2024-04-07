import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'cross-spawn';
import { rimraf } from 'rimraf';

import { Connection } from '../connection.js';
import { getPlatform } from '../util/platform.js';
import { DeferredPromise } from '../util/promise.js';
import { download } from '../util/download.js';
import { indent } from '../util/string.js';

export class BrowserLauncher {
  static #launchers = new Map();

  static register(name, launcher) {
    for (let n of [].concat(name))
      this.#launchers.set(n, launcher);
  }

  static resolve(name, ...args) {
    let Launcher = this.#launchers.get(name);
    if (!Launcher) throw new Error(`Unknown browser "${name}"`);
    return new Launcher(...args);
  }

  name = 'browser';
  platform = getPlatform();
  id = randomBytes(8).toString('hex');

  width = 1280;
  height = 720;
  headless = true;
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'test-browser-'));

  #ready = new DeferredPromise();
  #launch = new DeferredPromise();
  #exited = new DeferredPromise(() =>
    rimraf(this.profile).catch(() => {
      // silently fail when temp profile is not deleted
    }));

  #controller = new AbortController();

  constructor() {
    this.signal = this.#controller.signal;
    this.signal.addEventListener('abort', () => this.close());
  }

  configure(config) {
    if (config.debug != null)
      this.debug = !!config.debug;

    if (config.debug)
      this.headless = false;

    if (config.browser) {
      if (config.browser.name)
        this.name = config.browser.name;

      if (config.browser.url != null)
        this.url = config.browser.url;

      if (config.browser.width != null)
        this.width = config.browser.width;

      if (config.browser.height != null)
        this.height = config.browser.height;

      if (config.browser.headless != null)
        this.headless = config.browser.headless;

      if (config.browser.profile != null)
        this.profile = config.browser.profile;

      if (config.browser.devToolsPort != null)
        this.devToolsPort = config.browser.devToolsPort;

      if (config.browser.executablePath && !fs.existsSync(config.browser.executablePath))
        throw new Error(`Browser executable not found: ${config.browser.executablePath}`);

      if (config.browser.executablePath != null)
        this.executablePath = config.browser.executablePath;

      if (config.browser.launchArgs != null)
        this.launchArgs = config.browser.launchArgs;
    }
  }

  async apply(test) {
    test.on('run:abort', reason => {
      this.#controller.abort(reason);
    });

    test.on('server:event', async (id, event, data) => {
      if (id !== this.id) return;

      if (event === 'test:plan')
        return this.#ready.resolve();

      if (event === 'test:prepare' && this.devtools)
        return test.emit('server:send', id, 'devtools:enable');

      if (event === 'test:log')
        return test.emit('test:log', { ...data, origin: this.name });

      if (event === 'devtools:send' && this.devtools) {
        let results = await this.devtools.send(data.method, data.params);

        if (data.method === 'Page.captureScreenshot') {
          await test.emit('screenshot:capture', {
            ...({ group: this.name, ...data.meta }),
            format: data.params?.format ?? 'png',
            data: results?.data
          });
        }

        return results;
      }
    });

    test.on('test:start', async () => {
      await test.emit('browser:launch', this);
      this.launch();
    });

    test.on('test:plan', async ({ test }) => {
      if (!test.parent) await this.#ready;
    });

    await this.install();
  }

  async getExecutablePath() {
    if (this.executablePath) return this.executablePath;
    throw new Error(`Executable path not defined for ${this.name}`);
  }

  async install() {
    let executablePath = await this.getExecutablePath();
    if (fs.existsSync(executablePath)) return;

    let url = await this.getDownloadUrl();
    let dir = await this.getInstallPath();
    await download(this.name, url, dir);
  }

  async launch() {
    let executablePath = await this.getExecutablePath();
    let args = await this.getLaunchArgs(this.url).then(args =>
      args.flat().filter((a, i, args) => a && i === args.indexOf(a)));
    let options = { detached: process.platform !== 'win32' };

    this.process = spawn(executablePath, args, options);

    this.process.on('spawn', this.#launch.resolve);
    this.process.on('error', this.#launch.reject);
    this.process.on('exit', this.#exited.resolve);

    await this.#launch;
    await this.#connectDevTools();
    await this.#ready;
  };

  async close() {
    if (this.process?.pid && !this.process.killed)
      this.process.kill('SIGKILL');
    else this.#exited.resolve();
    await this.#exited;
  }

  async #connectDevTools() {
    if (!this.getDevToolsPort) return;
    let { WebSocket } = await import('ws');
    let port = await this.getDevToolsPort();
    let address = `http://localhost:${port}`;
    let interval = 1000;
    let retries = 10;

    let stderr = '\n';
    let errored = chunk => stderr += chunk;
    this.process.stderr.on('data', errored);

    while (retries-- > 0) {
      try {
        let res = await fetch(`${address}/json`, { method: 'put' });
        let { webSocketDebuggerUrl } = (await res.json()).find(t => {
          return t.type === 'page' && !t.url.startsWith('devtools:');
        });

        let remote = await new Connection(new WebSocket(webSocketDebuggerUrl), {
          send: (id, method, params) => ({ id, method, params }),
          receive: async (data, { resolve, reject }) => {
            let { id, error, result, method, params } = data;

            try {
              if (method) await remote.trigger(method, params);
            } catch (err) {
              error = err;
            }

            if (id != null) {
              if (error) reject(id, error);
              else resolve(id, result);
            }
          }
        });

        return this.devtools = {
          on: (method, fn) => remote.on(method, fn),
          send: (method, params) => remote.send(method, params).catch(err => {
            throw new Error(`DevTools error (${method}): ${err.message}` +
              ('data' in err ? `\n${indent(1, err.data)}` : ''));
          })
        };
      } catch (cause) {
        if (!retries)
          throw new Error(`Could not connect to DevTools at ${address} ${stderr}`, { cause });
        await new Promise(r => setTimeout(r, interval));
      }
    }
  }
}
