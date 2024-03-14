import { Remote } from '../remote.js';

export function remote(source) {
  if (typeof source === 'string') {
    if (source === 'process') source = globalThis.process;
    else if (source.startsWith('ws')) source = new globalThis.WebSocket(source);
    else throw new Error(`Invalid remote source "${source}"`);
  }

  let remote = new Remote(source);

  return async function*(source) {
    await remote;

    for await (let { type, data } of source)
      yield await remote.send(type, data);
  };
}

export default remote;
