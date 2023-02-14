import { WebSocketServer } from 'ws';

const deferred = () => {
  let resolve, reject, promise;
  promise = new Promise((...a) => ([resolve, reject] = a));
  return { resolve, reject, promise };
};

export function createTestServer(options) {
  if (typeof options === 'function')
    [options, hook] = [hook, options];

  let {
    port = 8080,
    once = true,
    closeSignals = ['SIGINT', 'SIGTERM', 'SIGHUP']
  } = options ?? {};

  let server = {
    emit: (type, name, data, next = i => i) => {
      let event = typeof type !== 'string' ? { ...type } : { type, name };
      if (typeof name === 'function') next = name;

      return (server.middlewares ?? []).reduceRight((nxt, mdw) => (
        data => mdw.call(server, { ...event, data }, d => nxt(d ?? data))
      ), next)(data ?? event.data);
    },

    use: (...middlewares) => middlewares.map(mdw => (
      mdw.call(server, { type: 'use', data: mdw }, (
        f => void (server.middlewares ??= []).push(f ?? mdw))
      ))),

    listen: async () => {
      let listening = deferred();
      server.wss = new WebSocketServer({ port }, listening.resolve);

      server.wss.on('connection', ws => {
        ws.on('message', msg => {
          try {
            let event = JSON.parse(msg);

            server.emit(event, data => {
              if (event.type === 'client', event.name === 'ready')
                client.ready.resolve();
              if (event.name === 'after:suite' && !data?.suite)
                client.done.resolve();
            });
          } catch (error) {
            // @todo: better top level errors
            console.error(error);
          }
        });
      });

      await listening.promise;
      await server.emit('server', 'listen');
      await server.emit('server', 'launch');
    },

    close: async () => {
      if (server.closing) return;
      server.closing = true;

      await server.emit('server', 'close');
      await server.wss?.close();
    }
  };

  for (let signal of closeSignals || [])
    process.on(signal, () => server.close(() => process.exit()));

  return server;
}

export default createTestServer;
