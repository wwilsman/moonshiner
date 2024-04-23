import { BrowserLauncher } from '../browser/index.js';

export class BrowserResolver {
  #browsers = new Map();
  #test;

  apply(test) {
    this.#test = test;

    test.on('test:configure', ({ config }) => {
      return this.#configure(config.browser ?? config.browsers);
    });
  }

  async #configure(browser, options) {
    if (!browser) return;

    if (Array.isArray(browser))
      for (let b of browser) await this.#configure(b, options);

    else if (Array.isArray(browser.browsers))
      return this.#configure(browser.browsers, browser);

    else if (Array.isArray(browser.names))
      return this.#configure(browser.names, browser);

    else if (typeof browser === 'string')
      return this.#resolve(browser, { ...options, name: browser });

    else if (Object(browser) === browser)
      return this.#resolve(browser.name ?? browser.browser, { ...options, ...browser });
  }

  async #resolve(key, options) {
    let browser = this.#browsers.get(key);

    if (!browser) {
      browser = BrowserLauncher.resolve(options.browser ?? options.name);
      this.#browsers.set(key, browser);
      await browser.apply(this.#test);
    }

    await browser.configure(options);
  }
}

export function browserResolver() {
  return new BrowserResolver();
}
