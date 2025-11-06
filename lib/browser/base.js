import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'cross-spawn';
import { rimraf } from 'rimraf';

import { Connection } from '../util/connection.js';
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

  #controller = new AbortController();
  #ready = new DeferredPromise(this.#controller.signal);
  #launch = new DeferredPromise(this.#controller.signal);
  #exited = new DeferredPromise(this.#controller.signal, () =>
    rimraf(this.profile).catch(() => {
      // silently fail when temp profile is not deleted
    }));

  constructor() {
    this.signal = this.#controller.signal;
    this.signal.addEventListener('abort', () => this.close());
  }

  configure(config) {
    if (config.name)
      this.name = config.name;

    if (config.url != null)
      this.url = config.url;

    if (config.width != null)
      this.width = config.width;

    if (config.height != null)
      this.height = config.height;

    if (config.headless != null)
      this.headless = config.headless;

    if (config.profile != null)
      this.profile = config.profile;

    if (config.devToolsPort != null)
      this.devToolsPort = config.devToolsPort;

    if (config.executablePath && !fs.existsSync(config.executablePath))
      throw new Error(`Browser executable not found: ${config.executablePath}`);

    if (config.executablePath != null)
      this.executablePath = config.executablePath;

    if (config.launchArgs != null)
      this.launchArgs = config.launchArgs;

    if (config.launchTimeout != null)
      this.launchTimeout = config.launchTimeout;
  }

  async apply(test) {
    let launched;

    test.on('test:configure', ({ config }) => {
      if (config.debug != null)
        this.debug = !!config.debug;

      if (config.debug)
        this.headless = false;

      if (config.browser != null)
        return this.configure(config.browser);
    });

    test.on('test:start', async () => {
      if (launched) return;
      launched = true;

      await test.trigger('browser:launch', {
        browser: this
      });

      if (this.remote) {
        let url = new URL(this.url);
        url.searchParams.set('__MOONSHINER_REMOTE__', this.remote);
        this.url = url.toString();
      }

      this.launch().catch(error => {
        test.abort(error);
      });
    });

    test.on('test:ready', async ({ test }) => {
      if (!test.depth) await this.#launch;
    }, { priority: 1 });

    test.on('test:abort', ({ aborted }) => {
      this.#controller.abort(aborted);
    });

    test.on('test:end', async () => {
      if (!this.debug) await this.close();
    });

    test.on('server:event', async ({ id, event, data }) => {
      if (id !== this.id) return;

      if (event === 'test:ready')
        return this.#ready.resolve();

      if (event === 'test:prepare' && this.devtools)
        return test.trigger('server:send', {
          id, event: 'devtools:enable',
          data: { bidi: this.devtools.bidi }
        });

      if (event === 'test:log')
        return test.trigger('test:log', {
          ...data, origin: this.name
        });

      if (event === 'devtools:send' && this.devtools) {
        let results = await this.devtools.send(data.method, data.params);

        if ((data.method === 'browsingContext.captureScreenshot' ||
             data.method === 'Page.captureScreenshot') && !test.debug)
          await test.trigger('screenshot:capture', {
            group: this.name, ...data.meta,
            format: data.params?.format ?? 'png',
            base64: results.data
          });

        return results;
      }
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
    let spawned = new DeferredPromise();
    let timeout = new DeferredPromise();
    let stderr = '';
    let error;

    this.process = spawn(executablePath, args, options);
    this.process.stderr.on('data', chunk => stderr += chunk);
    this.process.on('exit', this.#exited.resolve);
    this.process.on('spawn', spawned.resolve);
    this.process.on('error', spawned.reject);

    let timer = setTimeout(() => timeout.reject(error ??
      new Error(`Timed out launching ${this.name}`)
    ), this.launchTimeout ?? 10_000);

    await Promise.race([timeout, spawned
      .then(() => this.#connectDevTools(e => error = e))
      .then(() => this.debug && clearTimeout(timer))
      .then(() => this.#ready)
      .then(() => clearTimeout(timer))
      .then(() => this.#launch.resolve())
    ]).catch(error => {
      if (!this.signal.aborted)
        error.message += `\n\nProcess stderr:${indent(1, stderr)}`;
      this.#launch.reject(error);
      throw error;
    });
  };

  async close() {
    if (this.process?.pid && !this.process.killed)
      this.process.kill('SIGKILL');
    else this.#exited.resolve();
    await this.#exited;
  }

  async #connectDevTools(callback) {
    if (!this.getDevToolsPort) return;
    let { WebSocket } = await import('ws');
    let port = await this.getDevToolsPort();
    let interval = 1000;

    while (!this.signal.aborted) {
      try {
        let webSocketUrl = await fetch(`http://localhost:${port}/json`, { method: 'get' })
          .then(r => r.json()).then(a => a.find(t => t.type === 'page' && !t.url.startsWith('devtools:')))
          .then(t => t.webSocketDebuggerUrl, () => `ws://localhost:${port}/session`);

        let remote = await new Connection(new WebSocket(webSocketUrl), {
          send: (id, method, params) => ({ id, method, params }),
          receive: async (data, { resolve, reject }) => {
            let { id, type, error, result, method, params } = data;

            if (type === 'event' || (method && id == null))
              await remote.trigger(method, params).catch(err => error = err);

            if (id != null) {
              if (type === 'error' || error)
                reject(id, error || new Error(type === 'error' ? 'BiDi error' : 'Protocol error'));
              else resolve(id, result);
            }
          }
        });

        let devtools = {
          on: (method, fn) => remote.on(method, fn),
          send: (method, params) => remote.send(method, params).catch(err => {
            throw new Error(`Browser error (${method}): ${err.message}` +
              ('data' in err ? `\n${indent(1, err.data)}` : ''));
          })
        };

        await devtools.send('session.new', { capabilities: {} })
          .then(() => devtools.send('browsingContext.getTree', {}))
          .then(t => devtools.bidi = { context: t.contexts?.[0]?.context })
          .catch(() => {});

        return callback(null, this.devtools = devtools);
      } catch (cause) {
        callback(new Error(`Failed to connect to ${this.name}`, { cause }));
        await new Promise(r => setTimeout(r, interval));
      }
    }
  }
}
