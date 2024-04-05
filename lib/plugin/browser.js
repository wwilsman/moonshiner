import { BrowserLauncher } from '../browser/index.js';

export class BrowserResolver {
  #browsers = new Map();

  async #resolve(config, browser, options) {
    browser ??= config.browser ?? config.browsers;
    if (!browser) return;

    if (Array.isArray(browser)) {
      for (let b of browser) await this.#resolve(config, b, options);
      return;
    }

    if (Array.isArray(browser.browsers))
      return this.#resolve(config, browser.browsers, browser);

    if (Array.isArray(browser.names))
      return this.#resolve(config, browser.names, browser);

    if (typeof browser === 'string') {
      if (!this.#browsers.has(browser))
        this.#browsers.set(browser, BrowserLauncher.resolve(browser));

      return this.#browsers.get(browser).configure({
        ...config, browser: { ...options, name: browser }
      });
    }

    if (Object(browser) === browser) {
      let key = browser.name ?? browser.browser;

      if (!this.#browsers.has(key)) {
        let resolved = BrowserLauncher.resolve(browser.browser ?? browser.name);
        this.#browsers.set(key, resolved);
      }

      return this.#browsers.get(key).configure({
        ...config, browser: { ...options, ...browser }
      });
    }
  }

  configure(config) {
    return this.#resolve(config);
  }

  apply(test) {
    test.on('test:prepare', async () => {
      for (let [, browser] of this.#browsers)
        await browser.apply(test);
    });
  }
}

export function browserResolver() {
  return new BrowserResolver();
}
