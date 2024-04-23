import { promises as fs, existsSync } from 'node:fs';
import * as path from 'node:path';

function get(target, path) {
  return path.split('.').reduce((next, key) => {
    return next?.[key];
  }, target);
}

function set(target, path, value) {
  return path.split('.').reduce((next, key, index, path) => {
    if (index === path.length - 1) return (next[key] = value, target);
    return next[key] ??= isNaN(path[index + 1]) ? {} : [];
  }, target);
}

function deepmerge(...objects) {
  return objects.reduce((target, object) => {
    for (let key in object) {
      if (typeof target[key] === 'object' && typeof object[key] === 'object')
        deepmerge(target[key], object[key]);
      else target[key] = object[key];
    }

    return target;
  }, Array.isArray(objects[0]) ? [] : {});
}

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

  if (filename && existsSync(filename)) {
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

      if (configfile != null) {
        let [filename, loaded] = await ConfigLoader.load(configfile) ?? [];
        if (typeof loaded === 'function') loaded = await loaded(config, flags);
        if (loaded) config = deepmerge(config, loaded);
        if (filename) config.config = filename;
        await test.use(loaded?.plugins);
      }

      return deepmerge(config, flags);
    }, { before: true });
  }
}

export function configLoader() {
  return new ConfigLoader();
}
