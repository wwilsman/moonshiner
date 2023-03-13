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
  let ready = Promise.resolve();

  let runWhenReady = () => {
    clearTimeout(runWhenReady._timeout);

    runWhenReady._timeout = setTimeout(() => {
      ready = ready
        .then(() => Promise.all(Array.from(clients, c => c.ready.promise)))
        .then(() => Array.from(clients, c => c.ws.send('run')));
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
      let listening = deferred();

      ready = ready.then(() => listening.promise)
        .then(() => server.emit('server', 'listen', server))
        .then(() => server.emit('server', 'launch', server));

      server.http = http.createServer((_req, res) => {
        server.emit('server', 'request', res, res => {
          if (!res.headersSent) res.writeHead(404).end();
        });
      });

      server.wss = new WebSocketServer({
        server: server.http
      }).on('connection', ws => {
        let id = clients.size + 1;
        let client = { id, ws, ready: deferred() };
        clients.add(client);
        runWhenReady();

        ws.on('close', () => {
          clients.delete(client);
        });

        ws.on('message', msg => {
          try {
            let event = JSON.parse(msg);
            if (event.client) event.client.id = id;

            server.emit(event, data => {
              if (event.type === 'client', event.name === 'ready')
                client.ready.resolve();
              if (event.name === 'after:suite' && data?.depth === 0)
                if (once !== false) server.close();
            });
          } catch (error) {
            // @todo: better top level errors
            console.error(error);
          }
        });
      });

      server.http.listen(port, listening.resolve);
    },

    address: pathname => {
      if (pathname?.startsWith('http')) return pathname;
      let url = `http://localhost:${server.http.address().port}`;
      return new URL(pathname ?? '', url).toString();
    },

    close: async () => {
      if (server.closing) return;
      server.closing = true;

      for (let client of clients) client.ws.terminate();
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
