import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as https from 'node:https';
import { randomBytes } from 'node:crypto';
import { spawn } from 'cross-spawn';
import { rimraf } from 'rimraf';

import { Connection } from '../connection.js';
import { extract } from '../util/extract.js';
import { getPlatform } from '../util/platform.js';
import { DeferredPromise } from '../util/promise.js';
import { indent, formatBytes, formatTime } from '../util/string.js';

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
  log = process.stderr;

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

      if (config.browser.consoleAPICalled != null)
        this.consoleAPICalled = config.browser.consoleAPICalled;

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

      if (event === 'run:prepare' && this.devtools)
        return test.emit('server:send', id, 'devtools:enable');

      if (event === 'devtools:send' && this.devtools)
        return this.devtools.send(data.method, data.params);
    });

    test.on('run:start', async () => {
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
    if (fs.existsSync(executablePath)) return executablePath;

    let downloadUrl = await this.getDownloadUrl();
    let installPath = await this.getInstallPath();
    let downloadPath = path.join(installPath,
      decodeURIComponent(downloadUrl.split('/').pop())
    );

    try {
      if (!fs.existsSync(downloadPath)) {
        this.log.write(`Downloading ${this.name}...\n`);
        await fs.promises.mkdir(installPath, { recursive: true });

        await new Promise((resolve, reject) => https.get(downloadUrl, res => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Download failed: ${res.statusCode} - ${downloadUrl}`));
          } else {
            let total = parseInt(res.headers['content-length'], 10);
            let progress = { width: 25 };

            res.on('data', chunk => {
              let amount = progress.amount = (progress.amount ?? 0) + chunk.length;
              let ratio = amount === total ? 1 : Math.min(Math.max(amount / total, 0), 1);
              let length = progress.length = Math.round(progress.width * ratio);
              let elapsed = Date.now() - (progress.start ??= Date.now());
              let eta = (ratio >= 1) ? 0 : elapsed * (total / amount - 1);
              let percent = Math.floor(ratio * 100).toFixed(0);

              if (this.log.isTTY) {
                this.log.moveCursor(0, -1);
                this.log.clearLine(0);
                this.log.write(`Downloading ${this.name} ` +
                  `[${'='.repeat(length)}${' '.repeat(progress.width - length)}] ` +
                  `${formatBytes(amount)}/${formatBytes(total)} ` +
                  `${percent}% ${formatTime(eta)}\n`);
              }
            });

            res.pipe(fs.createWriteStream(downloadPath)
              .on('finish', resolve)
              .on('error', reject));
          }
        }).on('error', reject));
      }

      this.log.moveCursor?.(0, -1);
      this.log.clearLine?.(0);
      this.log.write(`Extracting ${this.name}...\n`);

      await extract(downloadPath, installPath);

      this.log.moveCursor?.(0, -1);
      this.log.clearLine?.(0);
      this.log.write(`Installed ${this.name}\n`);

      return executablePath;
    } finally {
      if (fs.existsSync(downloadPath))
        await rimraf(downloadPath);
    }
  }

  async launch() {
    let executablePath = await this.getExecutablePath();
    let args = await this.getLaunchArgs(this.url).then(args => (
      args.flat().filter((a, i, args) => a && i === args.indexOf(a))
    ));

    this.log.write(`Launching ${this.name}\n`);
    this.process = spawn(executablePath, args, {
      detached: process.platform !== 'win32'
    });

    this.process.on('spawn', this.#launch.resolve);
    this.process.on('error', this.#launch.reject);
    this.process.on('exit', this.#exited.resolve);

    await this.#launch;

    this.devtools = await this.#connectDevTools();

    if (this.devtools && this.consoleAPICalled !== false) {
      this.devtools.send('Runtime.enable');
      this.devtools.on('Runtime.consoleAPICalled', ({ type, args }) => {
        args = args.map(a => a.value ?? a.description);
        if (args.length) args[0] = `[${this.name}] ${args[0]}`;
        console[type]?.(...args);
      });
    }

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
          receive: (data, { resolve, reject }) => {
            let { id, error, result, method, params } = data;
            if (method) remote.trigger(method, params);
            if (error) reject(id, error);
            else resolve(id, result);
          }
        });

        return {
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
