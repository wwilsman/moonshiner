import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { WebSocketServer } from 'ws';
import mime from 'mime';

import { DeferredPromise } from './util/promise.js';

export class TestServer {
  #remoteListeners = new Map();
  #remotes = new Map();
  #serve;

  constructor(test, options) {
    this.port = options.port;
    this.#serve = [].concat(options.serve ?? []);

    this.httpServer = http.createServer(this.#onrequest);
    this.webSocketServer = new WebSocketServer({ server: this.httpServer });
    this.webSocketServer.on('connection', async (websocket, req) => {
      let remote = await test.connect(websocket);
      let id = decodeURIComponent(req.url.replace(/^\//, ''));
      if (!id) return;

      this.#remotes.set(id, remote.on(async (event, data) => {
        let listeners = this.#remoteListeners.get(id)?.get(event);
        for (let listener of listeners ?? []) data = await listener(data);
        if (event === 'close') this.#remotes.delete(id);
        return data;
      }));
    });

    options.signal?.addEventListener('abort', () => this.close());
  }

  #onrequest = async (req, res) => {
    for (let serve of this.#serve) {
      if (serve === Object(serve)) {
        let { pathname } = new URL(req.url, `http://${req.headers.host}`);
        if (!serve[pathname] && pathname.endsWith('/')) pathname += 'index.html';
        if (!serve[pathname]) continue;

        res.writeHead(200, { 'Content-Type': mime.getType(pathname) });
        res.end(serve[pathname]);
        return;
      } else if (typeof serve === 'string') {
        let dir = path.resolve(serve);
        let filepath = path.join(dir, req.url);
        if (!filepath.startsWith(dir)) continue;
        if (!fs.existsSync(filepath)) continue;

        res.writeHead(200, { 'Content-Type': mime.getType(filepath) });
        fs.createReadStream(filepath).pipe(res);
        return;
      }
    }

    res.writeHead(404).end();
  };

  address(pathname) {
    if (pathname?.startsWith('http')) return pathname;
    let host = `http://localhost:${this.httpServer.address().port}`;
    return new URL(pathname ?? '', host).toString();
  }

  async start() {
    let { resolve, promise } = new DeferredPromise();
    this.httpServer.listen(this.port, resolve);
    await promise;
  }

  on(id, event, fn) {
    let remoteListeners = this.#remoteListeners.get(id) ?? new Map();
    this.#remoteListeners.set(id, remoteListeners);
    let listeners = remoteListeners.get(event) ?? [];
    remoteListeners.set(event, listeners);
    listeners.push(fn);
  }

  async send(name, ...args) {
    return this.#remotes.get(name)?.send(...args);
  }

  close() {
    for (let [, remote] of this.#remotes)
      remote.source.terminate();

    this.webSocketServer?.close();
    this.httpServer?.close();
  }
}

export function server(options) {
  return test => {
    test.hook('before', async ({ signal }) => {
      test.server ??= new TestServer(test, { ...options, signal });
      await test.server.start();
    });
  };
}
