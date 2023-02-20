import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { deferred } from './utils.js';

export function createTestServer({
  port = 8080,
  once = true,
  timeout = 2000,
  closeSignals = ['SIGINT', 'SIGTERM', 'SIGHUP']
} = {}) {
  let clients = new Set();
  let done = Promise.resolve();
  let ready = Promise.resolve();

  let runWhenReady = () => {
    clearTimeout(runWhenReady._timeout);

    runWhenReady._timeout = setTimeout(() => {
      let sockets = Array.from(clients, c => c.ws);

      ready = ready
        .then(() => Promise.all(Array.from(clients, c => c.ready.promise))
        .then(() => sockets.forEach(ws => ws.send('run'))));

      done = done
        .then(() => Promise.all(Array.from(clients, c => c.done.promise))
        .then(() => once !== false && server.close()));
    }, timeout);
  };

  let server = {
    emit: (type, name, data, next = i => i) => {
      let event = typeof type !== 'string' ? { ...type } : { type, name };
      if (typeof name === 'function') next = name;

      return (server.middlewares ?? []).reduceRight((nxt, mdw) => (
        data => mdw.call(server, { ...event, data }, d => nxt(d ?? data))
      ), next)(data ?? event.data);
    },

    use: (...middlewares) => middlewares.map(mdw => (
      mdw.call(server, { type: 'use', data: mdw },
        f => void (server.middlewares ??= []).push(f ?? mdw)
      ))),

    listen: async () => {
      server.http = http.createServer((_req, res) => {
        server.emit('server', 'request', res, res => {
          if (!res.headersSent) res.writeHead(404).end();
        });
      });

      server.wss = new WebSocketServer({
        server: server.http
      }).on('connection', ws => {
        let client = { ws, ready: deferred(), done: deferred() };
        clients.add(client);
        runWhenReady();

        ws.on('close', () => {
          clients.delete(client);
        });

        ws.on('message', msg => {
          try {
            let event = JSON.parse(msg);

            server.emit(event, data => {
              if (event.type === 'client', event.name === 'ready')
                client.ready.resolve();
              if (event.name === 'after:suite' && data?.depth === 0)
                client.done.resolve();
            });
          } catch (error) {
            // @todo: better top level errors
            console.error(error);
          }
        });
      });

      let listening = deferred();
      server.http.listen(port, listening.resolve);
      await listening.promise;

      await server.emit('server', 'listen');
      await server.emit('server', 'launch');
    },

    address: pathname => {
      if (pathname?.startsWith('http')) return pathname;
      let url = `http://localhost:${server.http.address().port}`;
      return new URL(pathname ?? '', url).toString();
    },

    close: async () => {
      if (server.closing) return;
      server.closing = true;

      await server.emit('server', 'close');
      await server.http?.close();
      await server.wss?.close();
    }
  };

  for (let signal of closeSignals || [])
    process.on(signal, () => server.close(() => process.exit()));

  return server;
}

export default createTestServer;
