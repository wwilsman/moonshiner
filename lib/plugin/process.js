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
      if (!process.send) process.stdin.unref();
    }, { before: true });

    test.on('test:end', ({ fail, total }) => {
      if (fail || total.remains) process.exitCode = 1;
      if (!test.debug && !process.send) process.stdin.unref();
    }, { before: true });
  }
}

export function processHandler() {
  return new ProcessHandler();
}
