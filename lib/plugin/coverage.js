export class Coverage {
  #var = '__coverage__';
  #cov;

  async apply(test) {
    test.on('test:configure', async ({ config }) => {
      if (config.coverage?.variable != null)
        this.#var = config.coverage.variable;

      if (globalThis[this.#var])
        this.#cov = (await import('istanbul-lib-coverage')).default;
    });

    test.on('remote:event', async ({ data }) => {
      if (this.#cov && data.coverage != null)
        await this.#merge(data.coverage);
    });

    test.on((event, data) => {
      if (this.#cov && event === 'test:end')
        data.coverage = globalThis[this.#var];
    });
  }

  async #merge(coverage) {
    let map = this.#cov.createCoverageMap(globalThis[this.#var] ?? {});

    if (map && globalThis[this.#var] !== map)
      globalThis[this.#var] = map.data;

    map?.merge(coverage);
  }
}

export function coverage() {
  return new Coverage();
}
