import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Plugin that starts a Vite dev server for running browser tests.
 * Automatically loads your vite.config.js, sets mode to "test",
 * and injects your test files into the root HTML.
 * Requires vite to be installed.
 */
export class Vite {
  #vite;
  #config;
  #server;

  /**
   * @param {Object} [config] - Additional Vite configuration options to merge with your vite.config.js
   * @param {string[]} [config.testPatterns] - Glob patterns to match test files (auto-detects tests/**\/*.test.{js,jsx,ts,tsx} if not provided)
   * @param {Object[]} [config.plugins] - Additional Vite plugins to include
   */
  constructor(config = {}) {
    this.#config = config;
  }

  async apply(test) {
    test.on('test:configure', async () => {
      try {
        this.#vite = await import('vite');
      } catch (err) {
        throw new Error(
          'Vite plugin requires vite to be installed'
        );
      }

      this.#server = await this.#vite.createServer(
        await this.#getViteConfig()
      );
    });

    test.on('test:start', async () => {
      if (!this.#server) return;
      await this.#server.listen();
    }, { priority: 0 });

    test.on('browser:launch', ({ browser }) => {
      if (!this.#server?.resolvedUrls?.local?.[0]) return;
      browser.url = this.#server.resolvedUrls.local[0];
    });

    test.on('test:end', async () => {
      if (!this.#server) return;
      await this.#server.close();
      this.#server = null;
    });

    test.on('test:abort', async () => {
      if (!this.#server) return;
      await this.#server.close();
      this.#server = null;
    });
  }


  #findProjectRoot(from = process.cwd()) {
    let dir = from;

    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json')) ||
        fs.existsSync(path.join(dir, '.git')))
        return dir;
      dir = path.dirname(dir);
    }

    return from;
  }

  #findTestPatterns(viteRoot) {
    let projectRoot = this.#findProjectRoot();
    let relative = path.relative(viteRoot, projectRoot);
    let prefix = relative ? `${relative}/` : '';

    let patterns = [
      `${prefix}tests/**/*.test.{ts,tsx,js,jsx}`,
      `${prefix}test/**/*.test.{ts,tsx,js,jsx}`,
      `${prefix}**/*.test.{ts,tsx,js,jsx}`
    ];

    let existing = patterns.filter((_pattern, i) => {
      let dir = i === 0 ? 'tests' : i === 1 ? 'test' : null;
      return !dir || fs.existsSync(path.join(projectRoot, dir));
    });

    return existing.length > 0 ? existing : patterns;
  }

  async #getViteConfig() {
    let { testPatterns, ...config } = this.#config;
    config.plugins = [...(config.plugins ?? [])];
    config.mode ??= 'test';

    let resolved = await this.#vite.resolveConfig(config, 'serve');
    testPatterns ??= this.#findTestPatterns(resolved.root);

    if (testPatterns.length > 0)
      config.plugins.unshift({
        name: 'moonshiner:import-tests',
        transformIndexHtml: {
          order: 'pre',
          handler: html => html
            .replace(/<script\s+type="module"[^>]*>.*?<\/script>/gs, '')
            .replace('</body>', '  ' +
              '<script type="module">import.meta.glob([' +
              testPatterns.map(p => `"${p}"`).join(', ') +
              '], { eager: true })</script>\n</body>')
        }
      });

    return {
      ...config,
      optimizeDeps: {
        include: ['moonshiner', ...(config.optimizeDeps?.include ?? [])],
        ...config.optimizeDeps
      }
    };
  }
}

/**
 * Create a Vite dev server plugin for running browser tests with HMR support
 * @param {Object} [config] - Additional Vite configuration options to merge with your vite.config.js
 * @param {string[]} [config.testPatterns] - Glob patterns to match test files (auto-detected if not provided)
 * @returns {Vite}
 * @example
 * import { configure } from 'moonshiner';
 * import { vite } from 'moonshiner/bundler/vite';
 *
 * configure({
 *   browser: 'Chrome',
 *   plugins: [vite()]
 * });
 *
 * // Or with custom config
 * configure({
 *   browser: 'Chrome',
 *   plugins: [vite({
 *     testPatterns: ['src/**\/*.spec.js']
 *   })]
 * });
 */
export function vite(config) {
  return new Vite(config);
}
