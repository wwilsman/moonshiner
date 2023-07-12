import deferred from '../utils/deferred.js';
import createReporter from './base.js';

function serialize(data, visited = new Set()) {
  if (visited.has(data)) return data.id;
  if (typeof data === 'function') return;
  if (data == null || typeof data !== 'object') return data;
  if (!Array.isArray(data) && Object.getPrototypeOf(data) !== Object.prototype) return;
  let result, serialized = Array.isArray(data) ? [] : {};
  visited.add(data);

  for (let [prop, val] of Object.entries(data)) {
    if (prop === 'ref' && val.current) continue;
    if (prop !== 'path') val = serialize(val, new Set(visited));
    if (val != null) (result = serialized)[prop] = val;
  }

  return result;
}

export function reporter(fn, options) {
  if (typeof fn !== 'function')
    [fn, options] = [options, fn];

  let {
    url = 'ws://localhost:8080',
    WebSocket = globalThis?.WebSocket,
    socket = new WebSocket(url),
    name: client = globalThis?.navigator?.userAgent,
    send: map = fn ?? (event => event)
  } = options ?? {};

  let connected = new Promise((res, rej) => {
    if (socket.readyState === 1) return res();
    socket.addEventListener('open', res, { once: true });
    socket.addEventListener('error', rej, { once: true });
  });

  let promises = {};
  let send = ({ data, ...event }) => connected.then(() => {
    event = { ...event, client: { name: client } };

    if (data) event.data = serialize(data);
    socket.send(JSON.stringify(map(event)));

    if (event.id) return (
      promises[event.id] = deferred()
    ).promise;
  });

  let reporter = createReporter(event => send(event), runner => {
    let run, ready = new Promise(r => (run = r));

    socket.addEventListener('message', ({ data }) => {
      if (data.startsWith('event:ok:'))
        promises[data.split(':')[2]]?.resolve();
      if (data === 'run') run();
    });

    runner.use(({ type, name, ...event }, next) => {
      if (type === 'use') runner.send = send;
      if (type === 'run' && name === 'suite' && event.data.depth === 0)
        return send({ type: 'client', name: 'ready', ...event })
          .then(() => ready.then(next));
      return next();
    });
  });

  return Object.assign(reporter, { send });
}

export default reporter;
