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

      ws.on('message', data => {
        let { id, error, result } = JSON.parse(data);
        if (error) promises[id]?.reject(error);
        else promises[id]?.resolve(result);
      });

      let send = async (method, params) => {
        ws.send(JSON.stringify({ id: ++uid, method, params }));
        return (promises[uid] = deferred()).promise.catch(e => Promise.reject(
          new Error(`DevTools error (${method}): ${e.message}${(
            'data' in e ? `\n   ${e.data}\n` : '\n'
          )}`)
        ));
      };

      await ready.promise;
      return { url, send };
    } catch {
      if (!retries) throw new Error(`Could not connect to DevTools at ${address}`);
      await new Promise(r => setTimeout(r, timeout));
    }
  }
}

export default connectDevTools;
