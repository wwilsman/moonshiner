import {
  emitKeypressEvents
} from 'node:readline';

export class ProcessHandler {
  apply(test) {
    if (!process.send) {
      emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);

      process.stdin.unref();
      process.stdin.on('keypress', (_, key) => {
        if (key?.name === 'q' || (key?.name === 'c' && key.ctrl)) test.abort();
        if (key?.name === 'r') test.run();
      });

      process.on('SIGINT', () => test.abort());
      process.on('SIGTERM', () => test.abort());
    }

    test.on('test:end', ({ fail, total }) => {
      if (fail || total.remains) process.exitCode = 1;
    }, { before: true });
  }
}

export function processHandler() {
  return new ProcessHandler();
}
