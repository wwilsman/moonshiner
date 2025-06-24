import { promises as fs, existsSync } from 'node:fs';
import * as path from 'node:path';
import { Glob, hasMagic } from 'glob';
import { get, set, deepmerge } from '../util/object.js';

function isFlag(input) {
  if (!input.startsWith('-')) return false;
  if (!input.includes(' ')) return true;
  if (!input.includes('=')) return false;
  return input.indexOf('=') < input.indexOf(' ');
}

function parseFlags([...input], output = {}) {
  while (input.length && !isFlag(input[0])) input.shift();
  if (!input.length || input[0] === '--') return output;

  let [name, value] = input.shift().split('=');
  let negated = /^--no(-|(?=[A-Z]))/.test(name);
  name = name.replace(/^--(no(-|(?=[A-Z])))?/, '');

  if (value == null) {
    if (!input.length || isFlag(input[0])) value = !negated;
    else value = input.shift();
  }

  if (typeof value === 'string') {
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (!isNaN(value)) value = parseInt(value, 10);
  }

  let existing = get(output, name);
  if (existing) value = [].concat(existing, value);
  set(output, name, value);

  let alt = name.replace(/-([A-Za-z])/g, g => g[1].toUpperCase());
  if (alt !== name) set(output, alt, value);

  return parseFlags(input, output);
}

async function loadConfig(filename, supress) {
  if (!filename) return;

  if (Array.isArray(filename)) {
    for (let i = 0; i < filename.length; i++) {
      if (!filename[i] && i === filename.length - 1) return;
      let result = await loadConfig(filename[i], true);
      if (result) return result;
    }

    if (!supress)
      throw new Error('Config file not found');

    return;
  }

  if (hasMagic(filename, { magicalBraces: true })) {
    // eslint-disable-next-line no-unreachable-loop -- only load the first filepath
    for (let filepath of new Glob(filename, {})) return loadConfig(filepath);
  }

  if (existsSync(filename)) {
    let filepath = path.resolve(filename);
    let ext = path.extname(filename);

    if (ext === '.json')
      return [filename, JSON.stringify(await fs.readFile(filepath, 'utf-8'))];

    if (ext === '.js' || ext === '.cjs' || ext === '.mjs')
      return [filename, await import(filepath).then(module => module.default)];

    if (ext === '.yaml' || ext === '.yml') {
      let yaml = await import('js-yaml');
      let content = await fs.readFile(filepath, 'utf-8');
      return [filename, yaml.load(content, { filename })];
    }

    if (!supress)
      throw new Error(`Unsupported config format: ${ext}`);

    return;
  }

  if (!supress)
    throw new Error(`Config file not found: ${filename}`);
}

export class ConfigLoader {
  static load(filename) {
    return loadConfig(filename);
  }

  static flags(flags = process.argv) {
    return parseFlags(flags);
  }

  async apply(test) {
    let flags = ConfigLoader.flags();

    test.on('test:configure', async ({ config }) => {
      let configfile = flags.config ?? config.config;

      if (configfile) {
        let [filename, loaded] = await ConfigLoader.load(configfile) ?? [];
        if (typeof loaded === 'function') loaded = await loaded(config, flags);
        if (loaded) config = deepmerge(config, loaded);
        if (filename) config.config = filename;
        await test.use(loaded?.plugins);
      }

      return deepmerge(config, flags);
    }, { priority: 0 });
  }
}

export function configLoader() {
  return new ConfigLoader();
}
