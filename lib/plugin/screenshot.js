import * as fs from 'node:fs';
import * as path from 'node:path';

const ILLEGAL_RE = /[?<>\\:*"]/g;
// eslint-disable-next-line no-control-regex
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

      if (config.screenshots.capture != null)
        this.#capture = config.screenshots.capture;
    });

    test.on('screenshot:capture', async ({ ...options }) => {
      if (this.#disable === true) return;

      let fullname = options.fullname ??= sanitizeFilename([]
        .concat(options.prefix || [], options.name || [])
        .flat(Infinity).join(this.#separator));

      let cache = this.#screenshots.get(options.group) ?? new Set();
      if (cache.has(fullname)) throw new Error(`Duplicate screenshot name: ${fullname}`);
      this.#screenshots.set(options.group, cache);
      cache.add(fullname);

      let result = await this.#capture?.({ ...options });
      if (result && !(result.match || this.#update) && this.#disable !== 'throw')
        throw new Error(`Screenshot comparison failed for ${options.group}`);
    });
  }

  #capture = async ({ base64, ...options }) => {
    let ext = `.${options.format}`;
    let dir = path.join(this.#directory, options.group);

    options.baseline = path.join(dir, [options.fullname, ext].join(''));
    options.comparison = path.join(dir, [options.fullname, this.#newSuffix, ext].join(''));
    options.diff = path.join(dir, [options.fullname, this.#diffSuffix, ext].join(''));

    await fs.promises.mkdir(path.dirname(options.baseline), { recursive: true });
    if (!fs.existsSync(options.baseline)) await fs.promises.writeFile(options.baseline, base64, 'base64');
    if (fs.existsSync(options.diff)) await fs.promises.unlink(options.diff);

    let match = await fs.promises.readFile(options.baseline, 'base64') === base64;
    let result = { match };

    if (!result.match)
      await fs.promises.writeFile(options.comparison, base64, 'base64');
    if (!result.match && this.#compare)
      result = await this.#compare({ ...options }) ?? {};
    if (!result.match && this.#update)
      await fs.promises.writeFile(options.baseline, base64, 'base64');
    if ((result.match || this.#update) && fs.existsSync(options.comparison))
      await fs.promises.unlink(options.comparison);
    if ((result.match || this.#update) && fs.existsSync(options.diff))
      await fs.promises.unlink(options.diff);

    return result;
  };
}

export function screenshotCapture() {
  return new ScreenshotCapture();
}
