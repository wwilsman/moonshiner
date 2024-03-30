import { Reporter } from '../reporter/index.js';

export class ReporterResolver {
  #reporter;

  configure(config) {
    if (config.reporter == null) return;

    if (typeof config.reporter === 'function' ||
        config.reporter instanceof Reporter)
      this.#reporter = config.reporter;

    if (typeof config.reporter === 'string') {
      let isRemote =
        config.reporter === 'process' ||
        config.reporter.startsWith('ws');

      this.#reporter = isRemote
        ? Reporter.resolve('remote', { transport: config.reporter })
        : Reporter.resolve(config.reporter);
    }
  }

  apply(test) {
    test.on('run:prepare', () => {
      return this.#reporter?.apply(test);
    });
  }
}

export function reporterResolver() {
  return new ReporterResolver();
}
