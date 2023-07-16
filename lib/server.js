import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { deferred } from './utils.js';

const defaultOptions = {
  port: 8080,
  timeout: 2000,
  closeSignals: ['SIGINT', 'SIGTERM', 'SIGHUP']
};

export function createTestServer(options) {
  options = { ...defaultOptions, ...options };
  let ready = Promise.resolve();
  let clients = new Set();
  let events = new Set();

  let runWhenReady = () => {
    clearTimeout(runWhenReady._timeout);
    runWhenReady._timeout = setTimeout(() => (ready = ready
      .then(() => Promise.all(Array.from(clients, c => c.ready.promise)))
      .then(() => Array.from(clients, c => c.ws.send('run')))
    ), options.timeout);
  };

  let server = {
    options,

    configure(opts) {
      return Object.entries(opts).reduce((options, [key, value]) => {
        if (Object.getPrototypeOf(value) === Object.prototype)
          Object.assign((options[key] ??= {}), value);
        else options[key] = value;
        return options;
      }, options);
    },

    emit: (type, name, data, next = i => i) => {
      let event = typeof type !== 'string' ? { ...type } : { type, name };
      if (typeof name === 'function') next = name;

      let serverEvent = event.type === 'server'
        ? deferred(() => events.delete(serverEvent.promise)) : null;
      if (serverEvent) events.add(serverEvent.promise);

      let result = (server.middlewares ?? []).reduceRight((nxt, mdw) => (
        data => mdw.call(server, { ...event, data }, d => nxt(d ?? data))
      ), next)(data ?? event.data);

      if (serverEvent && typeof result?.then === 'function')
        result.then(serverEvent.resolve);
      else serverEvent?.resolve();

      return result;
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
              if (event.type === 'client' && event.name === 'ready')
                client.ready.resolve();
              if (event.name === 'after:suite' && data?.depth === 0 &&
                options.once !== false && !options.debug) server.close();
              if (event.id) ws.send(`ok:${JSON.stringify({ ...event, data })}`);
            });
          } catch (error) {
            // @todo: better top level errors
            console.error(error);
          }
        });
      });

      server.http.listen(options.port, listening.resolve);
    },

    address: pathname => {
      if (pathname?.startsWith('http')) return pathname;
      let url = `http://localhost:${server.http.address().port}`;
      return new URL(pathname ?? '', url).toString();
    },

    close: async force => {
      if (!force) await Promise.all([...events]);
      if (server.closing) return;
      server.closing = true;

      for (let client of clients) client.ws.terminate();
      await server.emit('server', 'close');
      await server.http?.close();
      await server.wss?.close();
    }
  };

  for (let signal of options.closeSignals)
    process.on(signal, () => server.close(true));

  return server;
}

export default createTestServer;
