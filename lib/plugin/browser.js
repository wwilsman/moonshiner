import { BrowserLauncher } from '../browser/index.js';

export class BrowserResolver {
  #browsers = new Map();

  async configure(config) {
    if (!config.browser && !config.browsers) return;

    if (typeof config.browser === 'string' && !this.#browsers.has(config.browser))
      this.#browsers.set(config.browser, BrowserLauncher.resolve(config.browser));

    if (Object(config.browser) === config.browser) {
      for (let name of config.browser.names ?? [config.browser.name]) {
        if (!this.#browsers.has(name))
          this.#browsers.set(name, BrowserLauncher.resolve(name));

        await this.#browsers.get(name).configure({
          ...config, browser: config.browser
        });
      }
    }

    if (Array.isArray(config.browsers)) {
      for (let browser of config.browsers) {
        if (typeof browser === 'string' && !this.#browsers.has(browser))
          this.#browsers.set(browser, BrowserLauncher.resolve(browser));

        if (Object(browser) === browser) {
          if (!this.#browsers.has(browser.name))
            this.#browsers.set(browser.name, BrowserLauncher.resolve(browser.name));

          await this.#browsers.get(browser.name).configure({
            ...config, browser
          });
        }
      }
    }
  }

  apply(test) {
    test.on('run:prepare', async () => {
      for (let [, browser] of this.#browsers)
        await browser.apply(test);
    });
  }
}

export function browserResolver() {
  return new BrowserResolver();
}
