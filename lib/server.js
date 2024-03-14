import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { WebSocketServer } from 'ws';
import mime from 'mime';

import { TestRemote } from './remote.js';
import { DeferredPromise } from './util/promise.js';

export class TestServer {
  #connections = new Map();
  #serve;

  constructor(test, { serve, port }) {
    let remote = new TestRemote(test);
    this.#serve = [].concat(serve ?? []);

    this.port = port;
    this.httpServer = http.createServer(this.#onrequest);
    this.webSocketServer = new WebSocketServer({
      server: this.httpServer
    });

    this.webSocketServer.on('connection', websocket => {
      this.#connections.set(websocket, remote.connect(websocket));
      websocket.on('close', () => this.#connections.delete(websocket));
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

  async ready() {
    await DeferredPromise.all(this.#connections);
  }

  close() {
    for (let [websocket] of this.#connections)
      websocket.terminate();

    this.httpServer?.close();
    this.webSocketServer?.close();
  }
}

export function server(options) {
  return test => {
    test.server ??= new TestServer(test, options);

    test.hook('before', async () => {
      await test.server.start();
    });

    test.hook('after', () => {
      test.server.close();
    });
  };
}
