import { Reporter } from '../reporter/index.js';

export class ReporterResolver {
  #reporters = new Map();
  #remote; #test;

  apply(test) {
    this.#test = test;

    test.on('test:configure', async ({ config }) => {
      if (config.remote != null)
        this.#remote = !!config.remote;

      if (config.reporter || config.reporters)
        await this.#configure(config.reporter ?? config.reporters);
    });

    test.on('test:prepare', async () => {
      if (!this.#reporters.size && !this.#remote)
        await this.#configure('spec');
    });
  }

  async #configure(reporter, options) {
    if (!reporter) return;

    if (Array.isArray(reporter))
      for (let r of reporter) await this.#configure(r, options);

    else if (Array.isArray(reporter.reporters))
      return this.#configure(reporter.reporters, reporter);

    else if (Array.isArray(reporter.names))
      return this.#configure(reporter.names, reporter);

    else if (typeof reporter === 'function')
      return this.#resolve(reporter, { ...options, reporter });

    else if (typeof reporter === 'string')
      return this.#resolve(reporter, { ...options, name: reporter });

    else if (Object(reporter) === reporter)
      return this.#resolve(reporter.name ?? reporter.reporter, { ...options, ...reporter });
  }

  async #resolve(key, options) {
    if (typeof key === 'function') key = key.name || '<anonymous>';
    let reporter = this.#reporters.get(key);

    if (!reporter) {
      if (typeof options.reporter === 'function') reporter = new Reporter(options.reporter);
      else reporter = Reporter.resolve(options.reporter ?? options.name);
      this.#reporters.set(key, reporter);
      await reporter.apply(this.#test);
    }

    await reporter.configure(options);
  }
}

export function reporterResolver() {
  return new ReporterResolver();
}
