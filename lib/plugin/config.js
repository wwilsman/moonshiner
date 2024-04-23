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
  let negated = /^--no(?:-|([A-Z]))/.test(name);
  name = name.replace(/^--no(?:-|([A-Z]))/, '$1');

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
      let config = await loadConfig(filename[i], true);
      if (config || (!filename[i] && i === filename.length - 1)) return config;
    }

    throw new Error('Config file not found');
  }

  if (filename && existsSync(filename)) {
    let filepath = path.resolve(filename);
    let ext = path.extname(filename);

    if (ext === '.json')
      return JSON.stringify(await fs.readFile(filepath, 'utf-8'));

    if (ext === '.js' || ext === '.cjs' || ext === '.mjs')
      return await import(filepath).then(module => module.default);

    if (ext === '.yaml' || ext === '.yml') {
      let yaml = await import('js-yaml');
      let content = await fs.readFile(filepath, 'utf-8');
      return yaml.load(content, { filename });
    }

    if (!supress)
      throw new Error(`Unsupported config format: ${ext}`);
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

  #enabled = true;

  async apply(test) {
    test.on('test:configure', async ({ config }) => {
      if (config.autoconfig != null)
        this.#enabled = config.autoconfig;

      if (this.#flags.config != null || config.config != null) {
        let loaded = await ConfigLoader.load(this.#flags.config ?? config.config);
        if (typeof loaded === 'function') loaded = await loaded(config, this.#flags);
        config = deepmerge(config, loaded);
      }

      return deepmerge(config, this.#flags);
    }, { before: true });
  }

  #cache;

  get #flags() {
    if (!this.#enabled) return {};
    return this.#cache ??= ConfigLoader.flags();
  }
}

export function configLoader() {
  return new ConfigLoader();
}
