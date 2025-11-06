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
        if (test.debug && key?.name === 'r') test.run();
      });
    }

    test.on('test:abort', () => {
      if (!process.send) process.stdin.unref?.();
      setImmediate(() => process.exit(process.exitCode));
    }, { priority: 100 });

    test.on('test:end', ({ fail, total }) => {
      if (!test.debug) process.stdin.unref?.();
      if (fail || total.remains) process.exitCode = 1;
    }, { priority: 0 });
  }
}

export function processHandler() {
  return new ProcessHandler();
}
