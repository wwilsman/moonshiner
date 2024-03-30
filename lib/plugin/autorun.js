export class AutoRun {
  #timeout; #run;

  configure({ autorun = 1000 }) {
    if (autorun != null) {
      clearTimeout(this.#timeout);

      this.#timeout = !autorun ? null : (
        setTimeout(() => this.#run(), autorun)
      );
    }
  }

  apply(test) {
    this.#run = () => {
      return test.run();
    };

    test.on('run:start', () => {
      clearTimeout(this.#timeout);
    });
  }
}

export function autorun() {
  return new AutoRun();
}
