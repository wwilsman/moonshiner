import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { WebSocketServer } from 'ws';
import mime from 'mime';

import { DeferredPromise } from './util/promise.js';

export class Server {
  #remoteListeners = new Map();
  #connections = new Map();
  #port; #serve;

  constructor(test, options) {
    let controller = new AbortController();
    this.signal = controller.signal;

    this.signal.addEventListener('abort', () => this.close());
    test.signal.addEventListener('abort', () => controller.abort(test.signal.reason));

    this.#port = options.port;
    this.#serve = [].concat(options.serve ?? []).reverse();
    this.debug = options.debug ?? test.debug ?? false;

    this.httpServer = http.createServer(this.#onrequest);
    this.webSocketServer = new WebSocketServer({ server: this.httpServer });
    this.webSocketServer.on('connection', async (websocket, req) => {
      let id = decodeURIComponent(req.url.replace(/^\//, ''));
      let connection = test.connect(websocket);
      let running = false;
      if (!id) return;

      this.#connections.set(id, connection.on(async (event, data) => {
        let listeners = this.#remoteListeners.get(id)?.get(event);
        for (let listener of listeners ?? []) data = await listener(data);

        if (event === 'run:start')
          running = true;
        if (event === 'close') {
          this.#connections.delete(id);
          if (this.debug && running &&
            !this.#connections.size
          ) this.close();
        }
      }));
    });
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

  get port() {
    return this.#port ?? this.httpServer.address()?.port;
  }

  address(pathname = '') {
    return new URL(pathname, `http://localhost:${this.port}`).toString();
  }

  connectionAddress(pathname = '') {
    return new URL(pathname, `ws://localhost:${this.port}`).toString();
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
    return this.#connections.get(name)?.send(...args);
  }

  close() {
    for (let [, connection] of this.#connections)
      connection.transport.terminate();
    this.webSocketServer?.close();
    this.httpServer?.close();
  }
}
