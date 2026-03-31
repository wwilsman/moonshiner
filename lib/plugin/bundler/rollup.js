export class Rollup {
  #rollup;
  #config;

  constructor(config = {}) {
    this.#config = config;
  }

  async apply(test) {
    test.on('test:configure', async ({ config }) => {
      try {
        this.#rollup = (await import('rollup')).rollup;
      } catch (err) {
        throw new Error(
          'Rollup bundler plugin requires rollup to be installed. ' +
          'Install it with: npm install --save-dev rollup'
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

export function rollup(config) {
  return new Rollup(config);
}
