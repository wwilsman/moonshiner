import {
  emitKeypressEvents
} from 'node:readline';

export class ProcessHandler {
  apply(test) {
    if (!process.send) {
      emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);

      process.on('SIGINT', () => test.abort());
      process.on('SIGTERM', () => test.abort());
      process.stdin.on('keypress', (_, key) => {
        if (key?.name === 'q' || (key?.name === 'c' && key.ctrl)) test.abort();
        if (key?.name === 'r') test.run();
      });
    }

    test.on('test:abort', () => {
      setImmediate(() => {
        if (!process.send) process.stdin.unref();
        process.exit(process.exitCode);
      });
    }, { priority: 100 });

    test.on('test:end', ({ fail, total }) => {
      if (fail || total.remains)
        process.exitCode = 1;
    }, { priority: 0 });

    test.on('test:end', ({ aborted }) => {
      setImmediate(() => {
        if (!process.send) process.stdin.unref();
        if (!test.debug || aborted) process.exit(process.exitCode);
      });
    }, { priority: 100 });
  }
}

export function processHandler() {
  return new ProcessHandler();
}
