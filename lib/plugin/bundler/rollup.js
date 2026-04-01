/**
 * Plugin that bundles test files using Rollup before running browser tests.
 * Requires rollup to be installed.
 */
export class Rollup {
  #rollup;
  #config;

  /**
   * @param {Object} [config] - Rollup configuration options (RollupOptions)
   */
  constructor(config = {}) {
    this.#config = config;
  }

  async apply(test) {
    test.on('test:configure', async ({ config }) => {
      try {
        this.#rollup = (await import('rollup')).rollup;
      } catch (err) {
        throw new Error(
          'Rollup bundler plugin requires rollup to be installed'
        );
      }

      let bundler = await this.#rollup(this.#config);

      try {
        let { output } = await bundler.generate(this.#config.output);
        let serve = [].concat(config.serve ?? [], output.reduce((files, file) => {
          let content = file.code ?? file.source;
          if (content != null) files[`/${file.fileName}`] = content;
          return files;
        }, {}));

        return { ...config, serve };
      } finally {
        await bundler.close();
      }
    }, { priority: 10 });
  }
}

/**
 * Create a Rollup bundler plugin for bundling test files before browser tests
 * @param {Object} [config] - Rollup configuration options
 * @returns {Rollup}
 * @example
 * import { configure } from 'moonshiner';
 * import { rollup } from 'moonshiner/bundler/rollup';
 * import { test as testConfig } from './rollup.config.js';
 *
 * configure({
 *   browser: 'Chrome',
 *   plugins: [rollup(testConfig)]
 * });
 */
export function rollup(config) {
  return new Rollup(config);
}
