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

export class Browser {
  id = randomBytes(8).toString('hex');
  name = 'browser';

  constructor(server, options) {
    this.platform = getPlatform();

    this.server = server;
    this.server.signal.addEventListener('abort', () => this.close());
    this.log = options.log ?? process.stderr;

    this.url = options.url;
    this.width = options.width ?? 1280;
    this.height = options.height ?? 720;
    this.debug = options.debug ?? server.debug ?? false;
    this.headless = options.headless ?? !this.debug;
    this.profile = options.profile ?? fs.mkdtempSync(
      path.join(os.tmpdir(), 'test-browser-'));
    this.devToolsPort = options.devToolsPort;
    this.consoleAPICalled = options.consoleAPICalled;

    if (options.executablePath && !fs.existsSync(options.executablePath))
      throw new Error(`Browser executable not found: ${options.executablePath}`);
    this.executablePath = options.executablePath;
    this.launchArgs = options.launchArgs;
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

  async launch(url = this.url) {
    url = new URL(url?.startsWith('http') ? url : this.server.address(url));
    url.searchParams.set('__MOONSHINER_REMOTE__', this.server.connectionAddress(this.id));

    let executablePath = await this.install();
    let args = await this.getLaunchArgs(url).then(args => (
      args.flat().filter((a, i, args) => a && i === args.indexOf(a))
    ));

    this.log.write(`Launching ${this.name}\n`);
    this.process = spawn(executablePath, args, {
      detached: process.platform !== 'win32'
    });

    let launched = new DeferredPromise();
    let ready = new DeferredPromise();

    this.process.on('spawn', launched.resolve);
    this.process.on('error', launched.reject);
    this.process.on('exit', this.#exited.resolve);
    this.server.on(this.id, 'test:plan', ready.resolve);

    await launched;

    if (this.getDevToolsPort) {
      this.devtools = await this.#connectDevTools();

      this.server.on(this.id, 'run:start', () =>
        this.server.send(this.id, 'devtools:enable'));
      this.server.on(this.id, 'devtools:send', ({ method, params }) =>
        this.devtools.send(method, params));

      if (this.consoleAPICalled !== false) {
        this.devtools.send('Runtime.enable');
        this.devtools.on('Runtime.consoleAPICalled', ({ type, args }) => {
          args = args.map(a => a.value ?? a.description);
          if (args.length) args[0] = `[${this.name}] ${args[0]}`;
          console[type]?.(...args);
        });
      }
    }

    await ready;
  };

  #exited = new DeferredPromise(() =>
    rimraf(this.profile).catch(() => {
      // silently fail when temp profile is not deleted
    }));

  async close() {
    if (this.process?.pid && !this.process.killed)
      this.process.kill('SIGKILL');
    else this.#exited.resolve();
    await this.#exited;
  }

  async #connectDevTools() {
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
