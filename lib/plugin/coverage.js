export class Coverage {
  #var = '__coverage__';

  async apply(test) {
    test.on('test:configure', ({ config }) => {
      if (config.coverage?.variable != null)
        this.#var = config.coverage.variable;
    });

    test.on('connection:event', async ({ data }) => {
      if (data.coverage != null)
        await this.#merge(data.coverage);
    });

    test.on((event, data) => {
      if (event === 'test:end' && globalThis[this.#var])
        data.coverage = globalThis[this.#var];
    });
  }

  async #merge(coverage) {
    let { default: cov } = await import('istanbul-lib-coverage');
    let map = cov.createCoverageMap(globalThis[this.#var]);

    if (map && globalThis[this.#var] !== map)
      globalThis[this.#var] = map.data;

    map?.merge(coverage);
  }
}

export function coverage() {
  return new Coverage();
}
