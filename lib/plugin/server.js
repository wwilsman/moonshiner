import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { WebSocketServer } from 'ws';
import mime from 'mime';

import { DeferredPromise } from '../util/promise.js';
import { Connection } from '../connection.js';

export class Server {
  #connections = new Map();
  #controller = new AbortController();
  #enabled; #port; #serve; #test;

  constructor(options) {
    this.signal = this.#controller.signal;
    this.signal.addEventListener('abort', () => this.close());
    if (options) this.configure({ server: options });
  }

  configure(config) {
    if (config.server || config.browser || config.browsers)
      this.#enable();

    if (config.server?.port != null)
      this.#port = config.server.port;

    if (Array.isArray(config.server?.serve))
      this.#serve = [].concat(config.server.serve).reverse();
  }

  async apply(test) {
    this.#test = test;

    test.on('test:start', () => {
      if (this.#enabled)
        return this.listen();
    });

    test.on('run:abort', reason => {
      this.#controller.abort(reason);
    });

    test.on('server:send', (id, event, data) => {
      return this.#connections.get(id)?.send(event, data);
    });

    test.on('browser:launch', browser => {
      if (!this.#enabled) return;

      let { id, url } = browser;
      url = new URL(url?.startsWith('http') ? url : this.address(url));
      url.searchParams.set('__MOONSHINER_REMOTE__', this.connectionAddress(id));
      browser.url = url.toString();
    });
  }

  async listen() {
    let { resolve, promise } = new DeferredPromise();
    this.httpServer.listen(this.port, resolve);
    await promise;
  }

  close() {
    for (let [, connection] of this.#connections)
      connection.transport.terminate();
    this.webSocketServer?.close();
    this.httpServer?.close();
  }

  get port() {
    return this.#port ?? this.httpServer.address()?.port;
  }

  address(pathname = '') {
    return new URL(pathname, `http://localhost:${this.port}`).toString();
  }

  connectionAddress(pathname = '') {
    return new URL(pathname, `ws://localhost:${this.port}`).toString();
  }

  #enable() {
    if (this.#enabled) return;
    this.httpServer = http.createServer(this.#onrequest);
    this.webSocketServer = new WebSocketServer({ server: this.httpServer });
    this.webSocketServer.on('connection', this.#onconnection);
    this.#enabled = true;
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

  #onconnection = async (websocket, req) => {
    let id = decodeURIComponent(req.url.replace(/^\//, ''));
    let connection = new Connection(websocket);
    let running;

    if (id) {
      this.#connections.set(id, connection.on(async (event, data) => {
        await this.#test.emit('server:event', id, event, data);

        if (event === 'test:start')
          running = true;

        if (event === 'close') {
          this.#connections.delete(id);

          if (this.#test.debug && running &&
            !this.#connections.size
          ) this.close();
        }
      }));
    }

    await this.#test.emit('remote:connect', connection, id);
  };
}

export function server(options) {
  return new Server(options);
}
