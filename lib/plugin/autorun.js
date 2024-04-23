export class AutoRun {
  #timeout;

  apply(test) {
    test.on('test:configure', ({ config }) => {
      let { autorun = 1000 } = config;
      clearTimeout(this.#timeout);

      this.#timeout = autorun
        ? setTimeout(() => test.run(), autorun)
        : null;
    });

    test.on('test:start', () => {
      clearTimeout(this.#timeout);
    });
  }
}

export function autorun() {
  return new AutoRun();
}
