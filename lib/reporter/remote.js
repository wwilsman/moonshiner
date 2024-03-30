import { Reporter } from './base.js';
import { Connection } from '../connection.js';

export class RemoteReporter {
  #transport;

  constructor({ transport }) {
    this.#transport = transport;
  }

  apply(test) {
    let connection = new Connection(this.#transport)
      .on('devtools:enable', () => {
        globalThis.DevTools = {
          send: (method, params, meta) =>
            connection.send('devtools:send', {
              method, params, meta
            })
        };
      });

    test.on('*', async (event, data) => {
      if (event === 'run:start') await connection;
      await connection.send(event, data);
    });
  }
}

export function remoteReporter(options) {
  return new RemoteReporter(options);
}

Reporter.register('remote', RemoteReporter);
