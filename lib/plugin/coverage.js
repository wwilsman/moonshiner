export class Coverage {
  #var = '__coverage__';
  #cov;

  async apply(test) {
    test.on('test:configure', async ({ config }) => {
      try {
        this.#cov = (await import('istanbul-lib-coverage')).default;
      } catch (err) {
        throw new Error(
          'Coverage plugin requires istanbul-lib-coverage to be installed. ' +
          'Install it with: npm install --save-dev istanbul-lib-coverage'
        );
      }

      if (config.coverage?.variable != null)
        this.#var = config.coverage.variable;
    });

    test.on('remote:event', async ({ data }) => {
      if (data.coverage != null)
        await this.#merge(data.coverage);
    });

    test.on((event, data) => {
      if (event === 'test:end' && globalThis[this.#var])
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
