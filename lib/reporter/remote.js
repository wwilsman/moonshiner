import { Connection } from '../connection.js';

export function remote(transport) {
  return async function*(source) {
    let remote = await new Connection(transport);

    for await (let { type, data } of source)
      yield await remote.send(type, data);
  };
}

export default remote;
