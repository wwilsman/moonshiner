import { WebSocket } from 'ws';
import deferred from './deferred.js';

export async function connectDevTools(port, options) {
  let { retries = 5, timeout = 1000 } = options ?? {};
  let address = `http://localhost:${port}`;

  while (retries-- > 0) {
    try {
      let res = await fetch(`${address}/json`, { method: 'put' });
      let json = await res.json();

      let page = json.find(t => t.type === 'page');
      let { webSocketDebuggerUrl: url } = page;
      let ws = new WebSocket(url);

      let ready = deferred();
      ws.on('open', ready.resolve);
      ws.on('error', ready.reject);

      let uid = 0;
      let promises = {};
      let callbacks = {};

      ws.on('message', data => {
        let { id, error, result, method, params } = JSON.parse(data);
        if (method) callbacks[method]?.(params);
        if (error) promises[id]?.reject(error);
        else promises[id]?.resolve(result);
      });

      let on = (method, fn) => {
        let prev = callbacks[method];
        callbacks[method] = (...args) =>
          (prev?.(...args), fn?.(...args));
      };

      let send = async (method, params) => {
        ws.send(JSON.stringify({ id: ++uid, method, params }));
        return (promises[uid] = deferred()).promise.catch(e => Promise.reject(
          new Error(`DevTools error (${method}): ${e.message}${(
            'data' in e ? `\n   ${e.data}\n` : '\n'
          )}`)
        ));
      };

      await ready.promise;
      return { url, send, on };
    } catch {
      if (!retries) throw new Error(`Could not connect to DevTools at ${address}`);
      await new Promise(r => setTimeout(r, timeout));
    }
  }
}

export default connectDevTools;
