import * as path from 'node:path';
import { glob, hasMagic } from 'glob';

export class RequireResolver {
  async configure(config) {
    if (config.require != null) {
      for (let require of [].concat(config.require)) {
        if (hasMagic(require, { magicalBraces: true }))
          require = await glob(require);

        for (let req of [].concat(require)) {
          if (req.startsWith('.') || req.startsWith('/'))
            req = path.resolve(req);
          await import(req);
        }
      }
    }
  }
}

export function requireResolver() {
  return new RequireResolver();
}
