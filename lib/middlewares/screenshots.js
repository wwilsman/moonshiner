import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { compare } from 'odiff-bin';
import hook from './hook.js';

const exists = path => fs.stat(path)
  .then(() => true, () => false);

export function screenshots({
  directory = 'screenshots',
  newSuffix = 'new',
  diffSuffix = 'diff'
} = {}) {
  directory = path.resolve(directory);

  return hook({
    on: e => e.name === 'devtools:result' &&
      e.data.method === 'Page.captureScreenshot'
  }, async ({
    params: { format = 'png' },
    result: { data: base64 },
    meta: { name }
  }) => {
    let baseline = path.join(directory, [name, format].join('.'));
    let changed = path.join(directory, [name, newSuffix, format].join('.'));
    let diff = path.join(directory, [name, diffSuffix, format].join('.'));

    let filename = await exists(baseline) ? changed : baseline;
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filename, base64, 'base64');
    if (await exists(diff)) await fs.unlink(diff);

    if (filename === changed) {
      let result = await compare(baseline, changed, diff);
      if (result.match) await fs.unlink(changed);
    }
  });
}

export default screenshots;
