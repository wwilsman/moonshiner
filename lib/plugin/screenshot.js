import * as fs from 'node:fs';
import * as path from 'node:path';

const ILLEGAL_RE = /[/?<>\\:*|"]/g;
const CONTROL_RE = /[\x00-\x1f\x80-\x9f]/g;
const RESERVED_RE = /^\.+$/;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const WINDOWS_TRAILING_RE = /[. ]+$/;

function sanitizeFilename(input, replacement = '') {
  let output = input
    .replace(ILLEGAL_RE, replacement)
    .replace(CONTROL_RE, replacement)
    .replace(RESERVED_RE, replacement)
    .replace(WINDOWS_RESERVED_RE, replacement)
    .replace(WINDOWS_TRAILING_RE, replacement);

  if (replacement) {
    output = output.replace(
      new RegExp(`${replacement}+`, 'g'),
      replacement);
  }

  if (!replacement) return output;
  return sanitizeFilename(output);
}

export class ScreenshotCapture {
  #screenshots = new Map();
  #newSuffix = '.new';
  #diffSuffix = '.diff';
  #compare;

  #directory = path.resolve(
    fs.existsSync('tests')
      ? 'tests/__screenshots__'
      : fs.existsSync('test')
        ? 'test/__screenshots__'
        : '__screenshots__');

  configure(config) {
    if (!config.screenshots) return;

    if (config.screenshots.directory != null)
      this.#directory = path.resolve(config.screenshots.directory);

    if (config.screenshots.newSuffix != null)
      this.#newSuffix = config.screenshots.newSuffix;

    if (config.screenshots.diffSuffix != null)
      this.#diffSuffix = config.screenshots.diffSuffix;

    if (config.screenshots.compare != null)
      this.#compare = config.screenshots.compare;
  }

  apply(test) {
    test.on('screenshot:capture', async (data, options) => {
      let name = sanitizeFilename(options.name, '-');
      let format = `.${options.format}`;

      let cache = this.#screenshots.get(options.group) ?? new Set();
      if (cache.has(name)) throw new Error('Duplicate screenshot name');
      this.#screenshots.set(options.group, cache);
      cache.add(name);

      let dir = path.join(this.#directory, options.group);
      let baseline = path.join(dir, [name, format].join(''));
      let comparison = path.join(dir, [name, this.#newSuffix, format].join(''));
      let diff = path.join(dir, [name, this.#diffSuffix, format].join(''));

      await fs.promises.mkdir(dir, { recursive: true });
      if (fs.existsSync(diff)) await fs.promises.unlink(diff);

      if (!fs.existsSync(baseline)) {
        await fs.promises.writeFile(baseline, data, 'base64');
      } else {
        let base = await fs.promises.readFile(baseline, 'base64');
        let result = { match: base === data };

        if (!result.match)
          await fs.promises.writeFile(comparison, data, 'base64');
        if (!result.match && this.#compare)
          result = await this.#compare?.(baseline, comparison, diff, options) ?? {};
        if (result.match && fs.existsSync(comparison))
          await fs.promises.unlink(comparison);
        if (!result.match)
          throw new Error('Screenshot comparison failed');
      }
    });
  }
}

export function screenshotCapture() {
  return new ScreenshotCapture();
}
