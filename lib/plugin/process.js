export class ProcessHandler {
  apply(test) {
    if (!process.send) {
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
