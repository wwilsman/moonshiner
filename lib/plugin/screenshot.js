import * as fs from 'node:fs';
import * as path from 'node:path';

const ILLEGAL_RE = /[?<>\\:*"]/g;
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
  #separator = ' | ';

  #disable;
  #update;
  #compare;

  #directory = path.resolve(
    fs.existsSync('tests')
      ? 'tests/__screenshots__'
      : fs.existsSync('test')
        ? 'test/__screenshots__'
        : '__screenshots__');

  apply(test) {
    test.on('test:configure', ({ config }) => {
      if (!config.screenshots) return;

      if (config.screenshots.disable != null)
        this.#disable = config.screenshots.disable;

      if (config.screenshots.update != null)
        this.#update = config.screenshots.update;

      if (config.screenshots.directory != null)
        this.#directory = path.resolve(config.screenshots.directory);

      if (config.screenshots.separator != null)
        this.#separator = config.screenshots.separator;

      if (config.screenshots.suffix?.new != null)
        this.#newSuffix = config.screenshots.suffix.new;

      if (config.screenshots.suffix?.diff != null)
        this.#diffSuffix = config.screenshots.suffix.diff;

      if (config.screenshots.compare != null)
        this.#compare = config.screenshots.compare;
    });

    test.on('screenshot:capture', async ({ data, ...options }) => {
      if (this.#disable === true) return;

      let cache = this.#screenshots.get(options.group) ?? new Set();
      let name = sanitizeFilename([]
        .concat(options.prefix || [], options.name || [])
        .flat(Infinity).join(this.#separator));
      let format = `.${options.format}`;

      if (cache.has(name)) throw new Error('Duplicate screenshot name');
      this.#screenshots.set(options.group, cache);
      cache.add(name);

      let dir = path.join(this.#directory, options.group);
      let baseline = path.join(dir, [name, format].join(''));
      let comparison = path.join(dir, [name, this.#newSuffix, format].join(''));
      let diff = path.join(dir, [name, this.#diffSuffix, format].join(''));

      await fs.promises.mkdir(path.dirname(baseline), { recursive: true });
      if (fs.existsSync(diff)) await fs.promises.unlink(diff);

      if (!fs.existsSync(baseline) || this.#update) {
        await fs.promises.writeFile(baseline, data, 'base64');
        if (!this.#update) return;
      }

      let result = {
        match: this.#update ||
          await fs.promises.readFile(baseline, 'base64') === data
      };

      if (!result.match)
        await fs.promises.writeFile(comparison, data, 'base64');
      if (!result.match && this.#compare)
        result = await this.#compare?.(baseline, comparison, diff, options) ?? {};
      if (result.match && fs.existsSync(comparison))
        await fs.promises.unlink(comparison);
      if (!result.match && this.#disable !== 'throw')
        throw new Error(`Screenshot comparison failed for ${options.group}`);
    });
  }
}

export function screenshotCapture() {
  return new ScreenshotCapture();
}
