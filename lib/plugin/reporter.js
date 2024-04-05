import { Reporter } from '../reporter/index.js';

export class ReporterResolver {
  #reporter;

  configure(config) {
    if (config.reporter == null && !config.remote)
      this.#reporter = Reporter.resolve('spec');

    else if (typeof config.reporter === 'function' ||
        config.reporter instanceof Reporter)
      this.#reporter = config.reporter;

    else if (typeof config.reporter === 'string')
      this.#reporter = Reporter.resolve(config.reporter);

    else if (Object(config.reporter) === config.reporter)
      this.#reporter = Reporter.resolve(config.reporter.name, config.reporter);
  }

  apply(test) {
    test.on('test:prepare', () => {
      return this.#reporter?.apply(test);
    });
  }
}

export function reporterResolver() {
  return new ReporterResolver();
}
