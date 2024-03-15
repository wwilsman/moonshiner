import * as fs from 'node:fs';
import * as cp from 'node:child_process';
import { promisify } from 'node:util';
import { DeferredPromise } from '../util/promise.js';

export async function extract(input, output) {
  if (input.endsWith('.zip')) {
    let { default: unzip } = await import('extract-zip');
    await unzip(input, { dir: output });
  } else if (input.endsWith('.dmg')) {
    let exec = promisify(cp.exec);
    let { stdout } = await exec(`hdiutil attach ${input}`);
    let [disk,, volume] = stdout.trim().split('\n').pop().split(/\t+/).map(s => s.trim());
    if (volume) await fs.promises.cp(volume, output, { recursive: true });
    await exec(`hdiutil detach ${disk}`);
  } else if (input.endsWith('.tar.bz2')) {
    let { default: tar } = await import('tar-fs');
    let { default: bzip } = await import('unbzip2-stream');
    let extraction = new DeferredPromise();

    fs.createReadStream(input).pipe(bzip())
      .pipe(tar.extract(output)
        .on('finish', extraction.resolve)
        .on('error', extraction.reject));

    await extraction;
  }
}
