import { WebSocketServer } from 'ws';

export function createTestServer(options, hook) {
  let closing, unhook;

  if (typeof options === 'function')
    [options, hook] = [hook, options];

  let {
    port = 8080,
    once = true,
    closeSignals = ['SIGINT', 'SIGTERM', 'SIGHUP']
  } = options ?? {};

  let server = {
    emit: (type, name, data, next = i => i) =>
      (server.middlewares ?? []).reduceRight((nxt, mdw) => (
        data => mdw.call(runner, { type, name, data }, d => nxt(d ?? data))
      ), next)(data),

    use: (...middlewares) => middlewares.map(mdw => (
      mdw.call(server, { type: 'use', data: fn }, (
        f => void server.middlewares.push(f ?? fn))
      ))),

    listen: async callback => {
      let resolve, promise = new Promise(r => (resolve = r));
      server.wss = new WebSocketServer({ port }, resolve);

      server.wss.on('connection', ws => {
        ws.on('message', msg => {
          try {
            let { type, name, data } = JSON.parse(msg);

            server.emit(type, name, data, ({ suite }) => {
              if (type === 'ready') ws.send('run');
              if (name === 'after:suite' && !suite && once)
                server.close();
            });
          } catch (error) {
            server.emit('console', 'error', error);
          }
        });
      });

      await promise;
      unhook = await hook?.(server);
      return callback?.();
    },

    close: async callback => {
      if (closing) return;
      closing = true;
      await unhook?.();
      await wss?.close();
      return callback?.();
    }
  };

  for (let signal of closeSignals || [])
    process.on(signal, () => server.close(() => process.exit()));

  return server;
}

export default createTestServer;
