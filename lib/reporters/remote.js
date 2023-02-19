import createReporter from './base.js';

function serialize(data, visited = new Set()) {
  if (visited.has(data) || typeof data === 'function') return;
  if (data == null || typeof data !== 'object') return data;

  if (!Array.isArray(data) && Object.getPrototypeOf(data) !== Object.prototype) return;
  let result, serialized = Array.isArray(data) ? [] : {};
  visited.add(data);

  if (data.error) (result = serialized).error = {
    message: data.error.message,
    stack: data.error.stack
  };

  for (let prop in data) {
    let val = serialize(data[prop], visited);
    if (val != null) (result = serialized)[prop] = val;
  }

  return result;
}

export function reporter({
  url = 'ws://localhost:8080',
  WebSocket = globalThis?.WebSocket,
  socket = new WebSocket(url),
  name: client = globalThis?.navigator?.userAgent
} = {}) {
  let connected = new Promise((res, rej) => {
    if (socket.readyState === 1) return res();
    socket.addEventListener('open', res, { once: true });
    socket.addEventListener('error', rej, { once: true });
  });

  let send = (type, name, data) => connected.then(() => {
    let payload = { type, name, client: { name: client } };
    if (data) payload.data = serialize(data);
    socket.send(JSON.stringify(payload));
  });

  let reporter = createReporter(({ type, name, data }) => {
    return send(type, name, data);
  }, runner => {
    let run, ready = new Promise(r => (run = r));

    socket.addEventListener('message', ({ data }) => {
      if (data === 'run') return run();
    });

    runner.use(({ type, name, data }, next) => {
      if (type === 'run' && name === 'suite' && data.depth === 0)
        return send('client', 'ready', data).then(() => ready.then(next));
      return next();
    });
  });

  return Object.assign(reporter, { send });
}

export default reporter;
