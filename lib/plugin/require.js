import * as path from 'node:path';
import { glob, hasMagic } from 'glob';

export class RequireResolver {
  apply(test) {
    test.on('test:configure', async ({ config }) => {
      if (config.require == null) return;

      for (let require of [].concat(config.require)) {
        if (hasMagic(require, { magicalBraces: true }))
          require = await glob(require, { dotRelative: true });

        for (let req of [].concat(require)) {
          if (req.startsWith('.') || req.startsWith('/'))
            req = path.resolve(req);
          await import(req);
        }
      }
    });
  }
}

export function requireResolver() {
  return new RequireResolver();
}
